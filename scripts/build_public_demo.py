"""Build a static, read-only preview from a reviewed subset of synthetic telemetry."""

from __future__ import annotations

import json
from ipaddress import IPv4Address, IPv4Network
from pathlib import Path
from shutil import copyfile
from typing import Any

from cyberforge.content.loader import load_bundle
from cyberforge.services import playground

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist" / "public-demo"
DATASET_SLUG = "cloud-audit-logs"
ROOT_LOGIN = "cloud-root-account-console-login"
COUNTRY_LOGIN = "cloud-console-login-from-unexpected-country"
EVENTS = (
    (
        0,
        "DescribeInstances",
        "Routine inventory read",
        ROOT_LOGIN,
        False,
        "An operations identity queried instance inventory. This read provides a baseline for the investigation.",
    ),
    (
        300,
        "ConsoleLogin",
        "Expected IAM sign-in",
        COUNTRY_LOGIN,
        False,
        "The IAM user's sign-in came from an expected country. This is a useful comparison for the later sign-in.",
    ),
    (
        4000,
        "ConsoleLogin",
        "Root console sign-in",
        ROOT_LOGIN,
        True,
        "The account root identity signed in to the console. Check the change record for an approved break-glass action.",
    ),
    (
        4100,
        "ConsoleLogin",
        "Unexpected IAM sign-in",
        COUNTRY_LOGIN,
        True,
        "The same IAM user signed in from outside the rule's expected countries. Compare this event with the earlier sign-in.",
    ),
    (
        4160,
        "CreateAccessKey",
        "Access key created for another identity",
        "cloud-access-key-created-for-another-user",
        True,
        "The event's actor and target identity differ. Review the authorization record for the credential change.",
    ),
    (
        4210,
        "AttachUserPolicy",
        "Administrative policy attached",
        "cloud-admin-policy-attached-to-user",
        True,
        "The target identity received an administrative policy. Review the privilege change alongside its earlier credential event.",
    ),
    (
        4300,
        "PutBucketAcl",
        "Bucket access widened",
        "cloud-storage-bucket-made-public",
        True,
        "The bucket grant changed to include a public group. The event shows exposure, while access records would establish whether data was read.",
    ),
    (
        4380,
        "StopLogging",
        "Audit trail stopped",
        "cloud-audit-logging-disabled",
        True,
        "CloudTrail recorded a StopLogging event. Confirm the trail's state and preserve available evidence from independent log sources.",
    ),
)
FIELDS = (
    "eventSource",
    "eventName",
    "userIdentity.type",
    "userIdentity.userName",
    "sourceIPAddress",
    "responseElements.ConsoleLogin",
    "geo.country",
    "requestParameters.userName",
    "requestParameters.policyArn",
    "requestParameters.bucketName",
    "requestParameters.grantee_uri",
    "requestParameters.name",
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


def public_trace(node: dict[str, Any], fields: dict[str, str]) -> dict[str, Any]:
    """Keep the evaluator's structure and enrich field references with observed values."""
    if node["kind"] != "item":
        return {
            "name": node["name"],
            "matched": node["matched"],
            "linking": node["linking"],
            "children": [public_trace(child, fields) for child in node["children"]],
        }
    field = node["field"]
    if field not in FIELDS:
        raise SystemExit(f"Unreviewed comparison field in the demo: {field}")
    values = []
    for check in node["values"]:
        expected = check["pattern"]
        if "fieldreference" in node["modifiers"]:
            reference = expected.removeprefix("SigmaFieldReference(field='").partition(
                "',"
            )[0]
            if reference not in FIELDS:
                raise SystemExit(f"Unreviewed field reference in the demo: {reference}")
            expected = f"{reference} = {fields.get(reference, 'missing')}"
        values.append({"expected": expected, "matched": check["matched"]})
    return {
        "field": field,
        "actual": fields.get(field),
        "operator": node["operator"],
        "linking": node["linking"],
        "matched": node["matched"],
        "values": values,
    }


def main() -> None:
    bundle = load_bundle(ROOT)
    dataset = next(
        (entry for entry in bundle.playground_datasets if entry.slug == DATASET_SLUG),
        None,
    )
    if dataset is None or dataset.kind != "events":
        raise SystemExit("The public demo dataset is missing")

    rules = {}
    for slug in dict.fromkeys(event[3] for event in EVENTS):
        rule = bundle.rule(slug)
        if rule is None or rule.format != "sigma" or rule.is_correlation:
            raise SystemExit(f"Unsupported public demo rule: {slug}")
        rules[slug] = rule
    items = playground.dataset_items(dataset)
    known_techniques = {
        technique["id"]: technique["name"] for technique in bundle.mitre_techniques
    }
    matches = {}
    for slug, rule in rules.items():
        result = playground.run("sigma", rule.content, items, known_techniques)
        if not result["valid"]:
            raise SystemExit(f"Invalid public demo rule: {slug}")
        matches[slug] = {
            row["index"] for row in result["results"] if row["verdict"] == "matched"
        }

    events = []
    for offset, action, title, slug, expected, note in EVENTS:
        item = next(
            entry
            for entry in items
            if entry.offset == offset and entry.fields.get("eventName") == action
        )
        fields = {key: item.fields[key] for key in FIELDS if key in item.fields}
        if not all(isinstance(value, str) for value in fields.values()):
            raise SystemExit(f"Unexpected public demo field value at offset {offset}")
        address = IPv4Address(fields["sourceIPAddress"])
        if not any(address in network for network in DOCUMENTATION_RANGES):
            raise SystemExit(
                f"Public demo address is outside documentation ranges at {offset}"
            )
        firing = [key for key, indices in matches.items() if item.index in indices]
        if firing != ([slug] if expected else []):
            raise SystemExit(
                f"Public demo verdict changed at offset {offset}: {firing}"
            )
        trace = playground.explain("sigma", rules[slug].content, items, item.index)
        explanation = trace["explanation"]
        if trace["matched"] != expected or item.timestamp is None:
            raise SystemExit(f"Public demo trace changed at offset {offset}")
        events.append(
            {
                "title": title,
                "note": note,
                "offset": offset,
                "timestamp": item.timestamp.isoformat(),
                "fields": fields,
                "rule": slug,
                "matched": expected,
                "condition": explanation["condition_text"],
                "groups": [
                    public_trace(group, fields) for group in explanation["selections"]
                ],
            }
        )

    payload = {
        "rules": {
            slug: {
                "title": rule.title,
                "severity": rule.level,
                "content": rule.content,
                "techniques": [
                    {"id": key, "name": known_techniques.get(key, key)}
                    for key in rule.technique_ids
                ],
            }
            for slug, rule in rules.items()
        },
        "events": events,
    }
    DIST.mkdir(parents=True, exist_ok=True)
    extra = {path.name for path in DIST.iterdir()} - FILES.keys() - {"data.js"}
    if extra:
        raise SystemExit(
            f"Unexpected files in the Pages artifact directory: {sorted(extra)}"
        )
    for name, source in FILES.items():
        copyfile(ROOT / source, DIST / name)
    (DIST / "data.js").write_text(
        f"export default {json.dumps(payload)};\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
