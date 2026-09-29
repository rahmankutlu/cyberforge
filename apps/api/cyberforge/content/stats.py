"""Repository statistics, calculated from the content on disk. Nothing here is hard-coded."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from cyberforge.content.loader import ContentBundle, load_bundle
from cyberforge.services import rule_quality, rule_tests


def collect(root: Path, bundle: ContentBundle | None = None) -> dict[str, Any]:
    bundle = bundle or load_bundle(root)
    summary = rule_tests.run_all(bundle)
    quality = rule_quality.evaluate_all(bundle, summary)
    by_format: dict[str, int] = {}
    for rule in bundle.rules:
        by_format[rule.format] = by_format.get(rule.format, 0) + 1
    mapped = {t for lab in bundle.labs for t in lab.doc.mitre} | {
        t for r in bundle.rules for t in r.technique_ids
    }
    story_techniques = {t for s in bundle.stories for t in s.techniques()}
    return {
        "labs": len(bundle.labs),
        "sigma_rules": by_format.get("sigma", 0),
        "yara_rules": by_format.get("yara", 0),
        "suricata_rules": by_format.get("suricata", 0),
        "mitre_techniques_mapped": len(mapped | story_techniques),
        "mitre_techniques_in_dataset": len(bundle.mitre_techniques),
        "stories": len(bundle.stories),
        "datasets": len(bundle.playground_datasets),
        "learning_tracks": len(bundle.tracks),
        "incidents": len(bundle.incidents),
        "detection_tests": summary.test_count,
        "detection_test_coverage": {
            "rules": summary.rule_count,
            "tested": summary.tested_rules,
            "percent": summary.coverage_percent,
        },
        "quality_checks": {
            "passed": sum(q.passed for q in quality),
            "total": sum(q.total for q in quality),
        },
    }


def as_rows(data: dict[str, Any]) -> list[tuple[str, int | str]]:
    cov = data["detection_test_coverage"]
    return [
        ("Labs", data["labs"]),
        ("Sigma rules", data["sigma_rules"]),
        ("YARA rules", data["yara_rules"]),
        ("Suricata rules", data["suricata_rules"]),
        ("MITRE techniques mapped", data["mitre_techniques_mapped"]),
        ("Attack stories", data["stories"]),
        ("Detection datasets", data["datasets"]),
        ("Detection tests", data["detection_tests"]),
        ("Detection test coverage", f"{cov['tested']}/{cov['rules']} ({cov['percent']}%)"),
    ]


def as_markdown(data: dict[str, Any]) -> str:
    lines = ["| | |", "| --- | ---: |"]
    lines += [f"| {label} | {value} |" for label, value in as_rows(data)]
    return "\n".join(lines)
