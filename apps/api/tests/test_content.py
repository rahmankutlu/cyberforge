"""Shipped content: integrity, minimum release quality bar, and detection correctness."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, datetime

import pytest

from cyberforge.content.loader import ContentBundle
from cyberforge.services import simulation
from cyberforge.services.sigma_engine import EvalEvent, SigmaEngine, compile_rule

START = datetime(2026, 9, 29, 10, 0, tzinfo=UTC)


def test_bundle_has_no_errors(bundle: ContentBundle) -> None:
    assert [str(i) for i in bundle.errors] == []


def test_release_quality_bar(bundle: ContentBundle) -> None:
    by_format = defaultdict(int)
    for rule in bundle.rules:
        by_format[rule.format] += 1
    assert len(bundle.labs) >= 20
    assert by_format["sigma"] >= 25
    assert by_format["yara"] >= 5
    assert by_format["suricata"] >= 5
    assert len(bundle.incidents) >= 10
    assert len(bundle.tracks) >= 6
    assert bundle.thirty_days and len(bundle.thirty_days.days) == 30
    mapped = {t for lab in bundle.labs for t in lab.doc.mitre} | {
        t for r in bundle.rules for t in r.technique_ids
    }
    assert len(mapped) >= 30
    scenario_events = sum(len(simulation.expand(lab.scenario)) for lab in bundle.labs)
    dataset_events = sum(len(simulation.expand(events)) for events in bundle.datasets.values())
    assert scenario_events + dataset_events >= 100


def test_lab_numbers_cover_the_specified_twenty(bundle: ContentBundle) -> None:
    assert sorted(lab.doc.number for lab in bundle.labs) == list(range(1, 21))


def test_lab_metadata_is_complete(bundle: ContentBundle) -> None:
    for lab in bundle.labs:
        doc = lab.doc
        assert doc.objectives and doc.mitigation and doc.cleanup and doc.references
        assert len(doc.investigation_questions) >= 2
        assert (lab.path / "README.md").is_file()
        assert (lab.path / doc.telemetry.scenario_file).is_file()


def test_mitre_identifiers_are_well_formed_and_named(bundle: ContentBundle) -> None:
    pattern = re.compile(r"^(T\d{4}(\.\d{3})?|AML\.T\d{4}(\.\d{3})?)$")
    for tech in bundle.mitre_techniques:
        assert pattern.match(tech["id"]), tech["id"]
        assert tech["name"] and tech["description"] and tech["url"].startswith("https://")
    tactic_ids = {t["id"] for t in bundle.mitre_tactics}
    assert all(set(t["tactics"]) <= tactic_ids for t in bundle.mitre_techniques)


def test_sigma_rule_ids_are_unique_uuids(bundle: ContentBundle) -> None:
    import yaml

    seen: set[str] = set()
    uuid_re = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
    for rule in bundle.rules:
        if rule.format != "sigma":
            continue
        for doc in yaml.safe_load_all(rule.content):
            assert uuid_re.match(doc["id"]), f"{rule.slug}: {doc['id']}"
            assert doc["id"] not in seen, f"duplicate id in {rule.slug}"
            seen.add(doc["id"])


def test_every_rule_documents_false_positives_and_mitre(bundle: ContentBundle) -> None:
    for rule in bundle.rules:
        if rule.format == "sigma":
            assert rule.false_positives, f"{rule.slug} lacks falsepositives"
            assert rule.technique_ids, f"{rule.slug} lacks a MITRE tag"


@pytest.fixture(scope="module")
def compiled(bundle: ContentBundle):  # type: ignore[no-untyped-def]
    return {r.slug: compile_rule(r.slug, r.content) for r in bundle.rules if r.format == "sigma"}


def test_every_lab_scenario_triggers_exactly_its_declared_rules(
    bundle: ContentBundle, compiled
) -> None:  # type: ignore[no-untyped-def]
    engine = SigmaEngine(compiled.values())
    for lab in bundle.labs:
        rows = simulation.materialize(lab.scenario, START)
        events = [
            EvalEvent(i, r["timestamp"], r["fields"], r["logsource"]) for i, r in enumerate(rows)
        ]
        fired = {hit.rule.slug for hit in engine.evaluate(events)}
        expected = set(lab.doc.expected_detection.rules)
        assert fired == expected, (
            f"{lab.doc.slug}: fired {sorted(fired)} expected {sorted(expected)}"
        )


def test_baseline_datasets_do_not_trip_high_severity_rules_by_accident(
    bundle: ContentBundle, compiled
) -> None:  # type: ignore[no-untyped-def]
    """Near-miss events (management agent PowerShell, expected-country login) must stay quiet."""
    engine = SigmaEngine(compiled.values())
    quiet = [
        "endpoint/windows-process-baseline",
        "cloud/cloudtrail-baseline",
        "authentication/windows-logons",
        "network/firewall-baseline",
        "network/dns-baseline",
    ]
    for name in quiet:
        rows = simulation.materialize(bundle.datasets[name], START)
        events = [
            EvalEvent(i, r["timestamp"], r["fields"], r["logsource"]) for i, r in enumerate(rows)
        ]
        assert engine.evaluate(events) == [], name


def test_attack_chain_datasets_cover_remaining_rules(bundle: ContentBundle, compiled) -> None:  # type: ignore[no-untyped-def]
    engine = SigmaEngine(compiled.values())
    fired: set[str] = set()
    for name in ("endpoint/credential-access-chain", "endpoint/lateral-movement-chain"):
        rows = simulation.materialize(bundle.datasets[name], START)
        events = [
            EvalEvent(i, r["timestamp"], r["fields"], r["logsource"]) for i, r in enumerate(rows)
        ]
        fired |= {h.rule.slug for h in engine.evaluate(events)}
    assert fired == {
        "win-lsass-process-access", "win-lsass-memory-dump-command-line", "win-certutil-urlcache-download",
        "win-wmi-spawned-shell", "win-service-installed-from-writable-path",
    }  # fmt: skip


def test_scenario_expansion_templates() -> None:
    from cyberforge.content.schemas import ScenarioEvent

    ev = ScenarioEvent(
        t=10,
        repeat=3,
        every=2,
        category="firewall",
        fields={"dst_port": "{i+20}", "note": "probe-{i}"},
    )
    pairs = simulation.expand([ev])
    assert [round(t) for t, _ in pairs] == [10, 12, 14]
    assert [e.fields["dst_port"] for _, e in pairs] == [20, 21, 22]
    assert [e.fields["note"] for _, e in pairs] == ["probe-0", "probe-1", "probe-2"]
