"""Build a static, read-only preview from a reviewed subset of synthetic telemetry."""

from __future__ import annotations

import json
from ipaddress import IPv4Address, IPv4Network
from pathlib import Path
from shutil import copyfile

from cyberforge.content.loader import load_bundle
from cyberforge.services import playground

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist" / "public-demo"
RULE_SLUG = "cloud-root-account-console-login"
DATASET_SLUG = "cloud-audit-logs"
EVENTS = [(300, "IAMUser"), (4000, "Root"), (4100, "IAMUser")]
FIELDS = (
    "eventSource",
    "eventName",
    "userIdentity.type",
    "userIdentity.userName",
    "sourceIPAddress",
    "responseElements.ConsoleLogin",
)
DOCUMENTATION_RANGES = tuple(
    IPv4Network(cidr) for cidr in ("192.0.2.0/24", "198.51.100.0/24", "203.0.113.0/24")
)
FILES = {
    "index.html": "public-demo/index.html",
    "demo.css": "public-demo/demo.css",
    "demo.js": "public-demo/demo.js",
    "icon.svg": "apps/web/src/app/icon.svg",
}


def main() -> None:
    bundle = load_bundle(ROOT)
    rule = bundle.rule(RULE_SLUG)
    dataset = next((entry for entry in bundle.playground_datasets if entry.slug == DATASET_SLUG), None)
    if rule is None or dataset is None or dataset.kind != "events":
        raise SystemExit("The public demo rule or event dataset is missing")

    items = playground.dataset_items(dataset)
    events = []
    for offset, identity in EVENTS:
        item = next(entry for entry in items if entry.offset == offset)
        fields = {key: item.fields[key] for key in FIELDS if key in item.fields}
        address = IPv4Address(fields["sourceIPAddress"])
        if (
            fields["eventName"] != "ConsoleLogin"
            or fields["userIdentity.type"] != identity
            or not any(address in network for network in DOCUMENTATION_RANGES)
        ):
            raise SystemExit(f"Unexpected public demo data at offset {offset}")

        trace = playground.explain("sigma", rule.content, items, item.index)
        explanation = trace["explanation"]
        [selection] = explanation["selections"]
        checks = []
        for check in selection["children"]:
            [value] = check["values"]
            checks.append({
                "field": check["field"],
                "actual": check["actual"],
                "expected": value["pattern"],
                "matched": check["matched"],
            })
        if (
            {check["field"] for check in checks} != {"eventName", "userIdentity.type"}
            or trace["matched"] != (identity == "Root")
        ):
            raise SystemExit(f"Public demo trace contract changed at offset {offset}")
        events.append({
            "offset": offset,
            "timestamp": item.timestamp.isoformat() if item.timestamp else None,
            "fields": fields,
            "matched": trace["matched"],
            "condition": explanation["condition_text"],
            "checks": checks,
        })

    payload = {"rule": {"title": rule.title, "content": rule.content}, "events": events}
    DIST.mkdir(parents=True, exist_ok=True)
    extra = {path.name for path in DIST.iterdir()} - FILES.keys() - {"data.js"}
    if extra:
        raise SystemExit(f"Unexpected files in the Pages artifact directory: {sorted(extra)}")
    for name, source in FILES.items():
        copyfile(ROOT / source, DIST / name)
    (DIST / "data.js").write_text(f"export default {json.dumps(payload)};\n", encoding="utf-8")


if __name__ == "__main__":
    main()
