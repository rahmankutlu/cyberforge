#!/usr/bin/env python3
"""Build mitre/attack.json and mitre/atlas.json from official MITRE data.

Only the identifiers listed in mitre/curated.yaml are kept. The script fails if an
identifier is missing upstream, so CyberForge can never ship an invented technique ID.

Sources (downloaded on demand, never at runtime):
  - https://github.com/mitre-attack/attack-stix-data  (ATT&CK Enterprise, STIX 2.1)
  - https://github.com/mitre-atlas/atlas-data         (ATLAS)

ATT&CK content is (c) The MITRE Corporation, used under the ATT&CK Terms of Use.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
MITRE_DIR = ROOT / "mitre"
ATTACK_URL = (
    "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/"
    "enterprise-attack/enterprise-attack.json"
)
ATLAS_URL = (
    "https://raw.githubusercontent.com/mitre-atlas/atlas-data/main/dist/ATLAS.yaml"
)

# Matrix column order. ATT&CK v19 split Defense Evasion into Stealth and Defense Impairment.
TACTIC_ORDER = [
    "reconnaissance", "resource-development", "initial-access", "execution", "persistence",
    "privilege-escalation", "stealth", "defense-impairment", "credential-access", "discovery",
    "lateral-movement", "collection", "command-and-control", "exfiltration", "impact",
]  # fmt: skip

CITATION = re.compile(r"\(Citation:[^)]*\)")
LINK = re.compile(r"\[([^\]]+)\]\([^)]*\)")
TAG = re.compile(r"</?code>|<br\s*/?>")


def clean(text: str, limit: int = 420) -> str:
    """Strip STIX markdown noise and keep the first paragraph, cut at a sentence boundary."""
    text = CITATION.sub("", text)
    text = LINK.sub(r"\1", text)
    text = TAG.sub("", text)
    text = re.sub(r"\s+", " ", text.split("\n\n")[0]).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    last = max(cut.rfind(". "), cut.rfind("? "))
    return cut[: last + 1] if last > 120 else cut.rstrip() + "…"


def fetch(url: str, local: Path | None) -> bytes:
    if local:
        return local.read_bytes()
    print(f"downloading {url}", file=sys.stderr)
    with urllib.request.urlopen(url, timeout=120) as resp:
        return resp.read()


def ext_id(obj: dict) -> str | None:
    for ref in obj.get("external_references", []):
        if ref.get("source_name") == "mitre-attack":
            return ref["external_id"]
    return None


def build_attack(curated: list[str], raw: bytes) -> dict:
    objects = json.loads(raw)["objects"]
    by_id = {o["id"]: o for o in objects}
    version = next(
        (
            o.get("x_mitre_version")
            for o in objects
            if o["type"] == "x-mitre-collection"
        ),
        "unknown",
    )

    active = [
        o for o in objects if not o.get("revoked") and not o.get("x_mitre_deprecated")
    ]
    tactics = {
        o["x_mitre_shortname"]: o for o in active if o["type"] == "x-mitre-tactic"
    }
    techniques = {ext_id(o): o for o in active if o["type"] == "attack-pattern"}

    mitigations: dict[str, list[dict]] = {}
    for rel in active:
        if rel["type"] != "relationship" or rel["relationship_type"] != "mitigates":
            continue
        src = by_id.get(rel["source_ref"])
        if not src or src["type"] != "course-of-action" or src.get("revoked"):
            continue
        mitigations.setdefault(rel["target_ref"], []).append(
            {
                "id": ext_id(src),
                "name": src["name"],
                "description": clean(
                    rel.get("description") or src.get("description", ""), 260
                ),
            }
        )

    missing = [t for t in curated if t not in techniques]
    if missing:
        raise SystemExit(
            f"ATT&CK identifiers not found upstream (or deprecated): {missing}"
        )

    out_techniques = []
    for tid in curated:
        obj = techniques[tid]
        shortnames = [
            p["phase_name"]
            for p in obj.get("kill_chain_phases", [])
            if p["kill_chain_name"] == "mitre-attack"
        ]
        parent = tid.split(".")[0] if "." in tid else None
        out_techniques.append(
            {
                "id": tid,
                "name": obj["name"],
                "framework": "attack",
                "tactics": [
                    ext_id(tactics[s])
                    for s in sorted(shortnames, key=TACTIC_ORDER.index)
                ],
                "description": clean(obj["description"]),
                "url": f"https://attack.mitre.org/techniques/{tid.replace('.', '/')}/",
                "is_subtechnique": parent is not None,
                "parent": parent,
                "platforms": obj.get("x_mitre_platforms", []),
                "mitigations": sorted(
                    mitigations.get(obj["id"], []), key=lambda m: m["id"]
                )[:4],
            }
        )

    curated_set = set(curated)
    orphans = [
        t["id"]
        for t in out_techniques
        if t["parent"] and t["parent"] not in curated_set
    ]
    if orphans:
        raise SystemExit(f"Sub-techniques without a curated parent: {orphans}")

    out_tactics = [
        {
            "id": ext_id(tactics[s]),
            "shortname": s,
            "name": tactics[s]["name"],
            "framework": "attack",
            "description": clean(tactics[s]["description"], 300),
            "url": f"https://attack.mitre.org/tactics/{ext_id(tactics[s])}/",
        }
        for s in TACTIC_ORDER
        if s in tactics
    ]
    return {
        "framework": "attack",
        "name": "MITRE ATT&CK Enterprise",
        "version": version,
        "source": ATTACK_URL,
        "notice": (
            "ATT&CK is a registered trademark of The MITRE Corporation. Content used under the "
            "ATT&CK Terms of Use (https://attack.mitre.org/resources/terms-of-use/)."
        ),
        "tactics": out_tactics,
        "techniques": out_techniques,
    }


def build_atlas(curated: list[str], raw: bytes) -> dict:
    data = yaml.safe_load(raw)
    matrix = data["matrices"][0]
    tactics = {t["id"]: t for t in matrix["tactics"]}
    techniques = {t["id"]: t for t in matrix["techniques"]}
    missing = [t for t in curated if t not in techniques]
    if missing:
        raise SystemExit(f"ATLAS identifiers not found upstream: {missing}")

    out_techniques, used = [], set()
    for tid in curated:
        obj = techniques[tid]
        # ATLAS ids look like AML.T0051 (technique) or AML.T0051.000 (sub-technique).
        parent = obj.get("subtechnique-of") or (
            tid.rsplit(".", 1)[0] if tid.count(".") == 2 else None
        )
        tactic_ids = obj.get("tactics") or (
            techniques[parent].get("tactics") if parent else []
        )
        used.update(tactic_ids)
        out_techniques.append(
            {
                "id": tid,
                "name": obj["name"],
                "framework": "atlas",
                "tactics": tactic_ids,
                "description": clean(obj["description"]),
                "url": f"https://atlas.mitre.org/techniques/{tid}",
                "is_subtechnique": bool(parent),
                "parent": parent,
                "platforms": [],
                "mitigations": [],
            }
        )
    out_tactics = [
        {
            "id": tid,
            "shortname": tactics[tid]["name"].lower().replace(" ", "-"),
            "name": tactics[tid]["name"],
            "framework": "atlas",
            "description": clean(tactics[tid].get("description", ""), 300),
            "url": f"https://atlas.mitre.org/tactics/{tid}",
        }
        for tid in tactics
        if tid in used
    ]
    return {
        "framework": "atlas",
        "name": "MITRE ATLAS",
        "version": str(data.get("version", "unknown")),
        "source": ATLAS_URL,
        "notice": "MITRE ATLAS is a trademark of The MITRE Corporation.",
        "tactics": out_tactics,
        "techniques": out_techniques,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--attack-file", type=Path, help="local enterprise-attack.json")
    parser.add_argument("--atlas-file", type=Path, help="local ATLAS.yaml")
    args = parser.parse_args()

    curated = yaml.safe_load((MITRE_DIR / "curated.yaml").read_text(encoding="utf-8"))
    attack = build_attack(curated["attack"], fetch(ATTACK_URL, args.attack_file))
    atlas = build_atlas(curated["atlas"], fetch(ATLAS_URL, args.atlas_file))
    for name, doc in (("attack", attack), ("atlas", atlas)):
        path = MITRE_DIR / f"{name}.json"
        path.write_text(
            json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        print(
            f"wrote {path.relative_to(ROOT)}: "
            f"{len(doc['tactics'])} tactics, {len(doc['techniques'])} techniques"
        )


if __name__ == "__main__":
    main()
