"""Match traces, the YARA and Suricata previews, curated datasets and the playground API."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from cyberforge.content.checks import check_datasets
from cyberforge.content.loader import ContentBundle
from cyberforge.services import (
    playground,
    rule_tests,
    sigma_explain,
    simulation,
    suricata_lite,
    yara_lite,
)
from cyberforge.services.sigma_engine import EvalEvent, compile_rule, match_event

T0 = datetime(2026, 1, 1, tzinfo=UTC)

ENCODED = """
title: Encoded PowerShell
id: 11111111-1111-4111-8111-111111111111
status: test
description: d
logsource: {category: process_creation, product: windows}
detection:
  selection_image:
    Image|endswith: '\\powershell.exe'
  selection_flag:
    CommandLine|contains:
      - ' -enc '
      - ' -ec '
  filter_mgmt:
    ParentImage|endswith: '\\CcmExec.exe'
  condition: selection_image and selection_flag and not filter_mgmt
falsepositives: [management tooling]
level: high
"""


def event(**fields: str) -> EvalEvent:
    return EvalEvent(0, T0, fields, {"category": "process_creation", "product": "windows"})


# --- match trace --------------------------------------------------------------------------------


def test_trace_of_a_match_lists_every_selection_and_the_condition() -> None:
    rule = compile_rule("r", ENCODED)
    exp = sigma_explain.explain_event(
        rule,
        event(Image="C:\\Windows\\powershell.exe", CommandLine="powershell.exe -enc AAAA", ParentImage="C:\\x.exe"),
    )
    assert exp.matched and exp.outcome == "matched"
    by_name = {s.name: s for s in exp.selections}
    assert by_name["selection_image"].matched and by_name["selection_flag"].matched
    assert not by_name["filter_mgmt"].matched
    assert exp.condition_text == "selection_image and selection_flag and not filter_mgmt"
    assert exp.condition is not None and exp.condition.matched
    flag = by_name["selection_flag"].children[0]
    assert flag.field == "CommandLine" and flag.operator == "contains"
    assert [v.matched for v in flag.values] == [True, False]  # ' -enc ' hit, ' -ec ' did not
    assert "Matched" in exp.summary


def test_trace_of_a_miss_names_the_blocking_selection() -> None:
    rule = compile_rule("r", ENCODED)
    exp = sigma_explain.explain_event(
        rule, event(Image="C:\\Windows\\powershell.exe", CommandLine="powershell.exe Get-Date")
    )
    assert not exp.matched and exp.outcome == "not_matched"
    assert "`selection_flag` did not match" in exp.summary
    assert "does not contain" in exp.summary


def test_trace_of_an_excluded_event_names_the_filter() -> None:
    rule = compile_rule("r", ENCODED)
    exp = sigma_explain.explain_event(
        rule,
        event(Image="C:\\a\\powershell.exe", CommandLine="powershell.exe -enc AA", ParentImage="C:\\CCM\\CcmExec.exe"),
    )
    assert not exp.matched
    assert "exclusion `filter_mgmt` applied" in exp.summary


def test_trace_reports_a_logsource_mismatch() -> None:
    rule = compile_rule("r", ENCODED)
    other = EvalEvent(0, T0, {"Image": "x"}, {"category": "dns"})
    exp = sigma_explain.explain_event(rule, other)
    assert exp.outcome == "logsource_mismatch" and not exp.matched


def test_trace_expands_one_of_selectors() -> None:
    text = """
title: t
id: 22222222-2222-4222-8222-222222222222
status: test
logsource: {product: test}
detection:
  selection_a: {A: 1}
  selection_b: {B: 2}
  condition: 1 of selection_*
level: low
"""
    rule = compile_rule("r", text)
    exp = sigma_explain.explain_event(rule, EvalEvent(0, T0, {"B": 2}, {"product": "test"}))
    assert exp.matched and exp.condition is not None
    assert exp.condition.op == "any_of"
    assert [c.matched for c in exp.condition.children] == [False, True]


def test_trace_agrees_with_the_engine_for_every_shipped_rule(bundle: ContentBundle) -> None:
    """The explanation can never disagree with the engine: check every rule and every test event."""
    disagreements: list[str] = []
    checked = 0
    for rule in bundle.rules:
        if rule.format != "sigma" or rule.is_correlation:
            continue
        compiled = compile_rule(rule.slug, rule.content)
        tests = rule_tests.load_tests_file(bundle.root / str(rule.tests_path))
        for case in tests.tests:
            for ev in rule_tests.build_events(case, compiled):
                truth = match_event(compiled, ev)[0]
                exp = sigma_explain.explain_event(compiled, ev)
                checked += 1
                if exp.matched != truth:
                    disagreements.append(f"{rule.slug}: {case.name}")
    assert checked > 100
    assert disagreements == []


def test_trace_agrees_with_the_engine_over_lab_scenarios(bundle: ContentBundle) -> None:
    compiled = [
        compile_rule(r.slug, r.content)
        for r in bundle.rules
        if r.format == "sigma" and not r.is_correlation
    ]
    mismatches = 0
    for lab in bundle.labs:
        for row in simulation.materialize(lab.scenario, T0)[:40]:
            ev = EvalEvent(0, row["timestamp"], row["fields"], row["logsource"])
            for rule in compiled:
                if sigma_explain.explain_event(rule, ev).matched != match_event(rule, ev)[0]:
                    mismatches += 1
    assert mismatches == 0


def test_correlation_explanation_lists_hits_and_base_matches() -> None:
    text = """
title: base
id: 33333333-3333-4333-8333-333333333333
name: failed
status: test
logsource: {product: test}
detection:
  selection: {EventID: 4625}
  condition: selection
level: low
---
title: burst
id: 44444444-4444-4444-8444-444444444444
status: test
correlation:
  type: event_count
  rules: [failed]
  group-by: [Ip]
  timespan: 1m
  condition: {gte: 3}
level: high
"""
    rule = compile_rule("burst", text)
    evs = [EvalEvent(i, T0.replace(second=i), {"EventID": 4625, "Ip": "1.1.1.1"}, {"product": "test"}) for i in range(3)]
    out = sigma_explain.explain_correlation(rule, evs)
    assert out["type"] == "event_count" and out["group_by"] == ["Ip"]
    assert out["hits"][0]["event_indexes"] == [0, 1, 2]
    assert out["base_rules"][0]["matching_events"] == [0, 1, 2]


# --- YARA preview -------------------------------------------------------------------------------

YARA = """
rule Demo
{
    meta:
        description = "demo"
    strings:
        $a = "hello" nocase
        $b = /wor[l1]d/
        $c = "missing"
    condition:
        filesize < 1KB and $a and any of ($b, $c)
}
"""


def test_yara_preview_reports_each_string_and_term() -> None:
    hit = yara_lite.evaluate(YARA, "Well, HELLO w0rld... world")
    assert hit.matched and not hit.unsupported
    strings = {s.name: s for s in hit.strings}
    assert strings["$a"].matched and strings["$b"].matched and not strings["$c"].matched
    assert any(t.label.startswith("filesize <") and t.matched for t in hit.terms)
    miss = yara_lite.evaluate(YARA, "hello there")
    assert not miss.matched
    assert any(t.label.startswith("any of") and not t.matched for t in miss.terms)


def test_yara_preview_filesize_and_magic_bytes() -> None:
    rule = 'rule M { strings: $s = "x" condition: uint16be(0) == 0x4D5A and $s }'
    assert yara_lite.evaluate(rule, b"MZ...x").matched
    assert not yara_lite.evaluate(rule, b"ZM...x").matched
    small = "rule S { strings: $s = \"x\" condition: filesize < 4 and $s }"
    assert yara_lite.evaluate(small, "xx").matched and not yara_lite.evaluate(small, "xxxxxx").matched


def test_yara_preview_flags_unsupported_constructs_instead_of_guessing() -> None:
    hexrule = "rule H { strings: $h = { 4D 5A } condition: $h }"
    assert yara_lite.evaluate(hexrule, "MZ").unsupported


# --- Suricata preview ---------------------------------------------------------------------------

SURICATA = (
    'alert http any any -> $HOME_NET any (msg:"scanner ua"; flow:established,to_server; '
    'http.user_agent; content:"sqlmap"; nocase; sid:1; rev:1;)'
)


def test_suricata_breakdown_and_content_match() -> None:
    exp = suricata_lite.evaluate(SURICATA, {"cs-user-agent": "SQLMAP/1.7", "cs-uri-stem": "/"})
    assert exp.matched is True
    assert (exp.action, exp.protocol, exp.sid, exp.msg) == ("alert", "http", "1", "scanner ua")
    assert exp.checks[0].buffer == "http.user_agent" and exp.checks[0].modifiers == ["nocase"]
    assert "flow:established,to_server" in exp.not_evaluated or "flow" in " ".join(exp.not_evaluated)
    assert suricata_lite.evaluate(SURICATA, {"cs-user-agent": "curl/8"}).matched is False


def test_suricata_is_not_applicable_without_the_buffer() -> None:
    assert suricata_lite.evaluate(SURICATA, {"query": "example.org"}).matched is None


def test_suricata_rejects_garbage() -> None:
    with pytest.raises(suricata_lite.SuricataError):
        suricata_lite.parse("not a rule")


# --- datasets -----------------------------------------------------------------------------------


def test_every_dataset_triggers_the_rules_it_promises(bundle: ContentBundle) -> None:
    assert len(bundle.playground_datasets) >= 10
    assert check_datasets(bundle) == []


def test_datasets_have_the_documented_metadata(bundle: ContentBundle) -> None:
    for ds in bundle.playground_datasets:
        assert ds.description and ds.source_type and ds.expected_rules
        assert playground.dataset_items(ds), ds.slug
    assert max(len(playground.dataset_items(d)) for d in bundle.playground_datasets) >= 200


# --- API ----------------------------------------------------------------------------------------


def test_datasets_endpoint(client: TestClient) -> None:
    rows = client.get("/api/v1/playground/datasets").json()
    slugs = {r["slug"] for r in rows}
    assert {"windows-process-execution", "dns-anomalies", "file-samples"} <= slugs
    row = next(r for r in rows if r["slug"] == "authentication-failures")
    assert row["item_count"] > 50
    assert row["expected_rules"][0]["slug"] and row["mitre"][0]["name"]
    detail = client.get("/api/v1/playground/datasets/authentication-failures").json()
    assert len(detail["items"]) == row["item_count"]
    assert detail["items"][0]["raw"]
    assert client.get("/api/v1/playground/datasets/nope").status_code == 404


def _rule(client: TestClient, slug: str) -> str:
    return client.get(f"/api/v1/detections/{slug}").json()["content"]


def test_run_sigma_rule_over_a_dataset(client: TestClient) -> None:
    body = {
        "content": _rule(client, "win-office-application-spawns-shell"),
        "format": "sigma",
        "dataset": "windows-process-execution",
    }
    out = client.post("/api/v1/playground/run", json=body).json()
    assert out["valid"] and out["matched_count"] == 1
    hit = next(r for r in out["results"] if r["verdict"] == "matched")
    assert set(hit["matched_fields"]) == {"ParentImage", "Image"}
    assert out["mitre"] and out["meta"]["falsepositives"]


def test_run_correlation_rule_marks_member_events(client: TestClient) -> None:
    body = {
        "content": _rule(client, "win-failed-logon-burst"),
        "format": "sigma",
        "dataset": "authentication-failures",
    }
    out = client.post("/api/v1/playground/run", json=body).json()
    assert out["correlation"]["hits"], "the burst should be detected"
    assert out["matched_count"] >= 10


def test_explain_returns_a_selection_level_trace(client: TestClient) -> None:
    content = _rule(client, "win-office-application-spawns-shell")
    run = client.post(
        "/api/v1/playground/run",
        json={"content": content, "format": "sigma", "dataset": "windows-process-execution"},
    ).json()
    index = next(r["index"] for r in run["results"] if r["verdict"] == "matched")
    out = client.post(
        "/api/v1/playground/explain",
        json={"content": content, "format": "sigma", "dataset": "windows-process-execution", "index": index},
    ).json()
    exp = out["explanation"]
    assert out["matched"] and exp["outcome"] == "matched"
    assert {s["name"] for s in exp["selections"]} == {"selection_parent", "selection_child"}
    assert exp["condition"]["matched"] and exp["summary"].startswith("Matched")
    assert out["item"]["raw"] and out["item"]["fields"]["Image"]


def test_run_custom_events(client: TestClient) -> None:
    content = _rule(client, "win-security-log-cleared")
    out = client.post(
        "/api/v1/playground/run",
        json={
            "content": content,
            "format": "sigma",
            "events": [
                {"category": "windows_security", "fields": {"EventID": 1102}},
                {"category": "windows_security", "fields": {"EventID": 4624}},
            ],
        },
    ).json()
    assert [r["verdict"] for r in out["results"]] == ["matched", "no_match"]


def test_run_reports_invalid_rules_without_failing(client: TestClient) -> None:
    out = client.post(
        "/api/v1/playground/run",
        json={"content": "title: broken\ndetection: [", "format": "sigma", "dataset": "dns-anomalies"},
    ).json()
    assert out["valid"] is False and out["errors"]


def test_run_yara_over_file_samples(client: TestClient) -> None:
    rule = client.get("/api/v1/detections/yara-cyberforge-lab-canary-token").json()["content"]
    out = client.post(
        "/api/v1/playground/run", json={"content": rule, "format": "yara", "dataset": "file-samples"}
    ).json()
    verdicts = {r["index"]: r["verdict"] for r in out["results"]}
    assert list(verdicts.values()).count("matched") == 1
    exp = client.post(
        "/api/v1/playground/explain",
        json={"content": rule, "format": "yara", "dataset": "file-samples", "index": 1},
    ).json()
    assert exp["matched"] and exp["explanation"]["strings"][0]["matched"]


def test_run_suricata_over_http_logs(client: TestClient) -> None:
    rule = client.get("/api/v1/detections/suricata-9000004").json()["content"]
    out = client.post(
        "/api/v1/playground/run", json={"content": rule, "format": "suricata", "dataset": "http-access-logs"}
    ).json()
    assert out["valid"] and out["matched_count"] >= 4


def test_playground_rejects_bad_input(client: TestClient) -> None:
    assert client.post("/api/v1/playground/run", json={"content": "x"}).status_code == 422
    bad = {"content": "title: x", "format": "sigma", "events": [{"category": "nope", "fields": {}}]}
    assert client.post("/api/v1/playground/run", json=bad).status_code == 422
    too_many = {"content": "title: x", "events": [{"fields": {}}] * 501}
    assert client.post("/api/v1/playground/run", json=too_many).status_code == 422


# --- regex guard --------------------------------------------------------------------------------


def test_regex_guard_refuses_catastrophic_shapes_and_accepts_normal_patterns() -> None:
    from cyberforge.services import regex_guard

    assert regex_guard.has_nested_quantifier("(a+)+$")
    assert regex_guard.has_nested_quantifier("(a|b*)*c")
    assert regex_guard.has_nested_quantifier("((ab)+c)*")
    assert regex_guard.has_nested_quantifier("(x{2,})+")
    assert not regex_guard.has_nested_quantifier(r"^[a-z0-9+/=_-]{30,}\.")
    assert not regex_guard.has_nested_quantifier(r"eval\s*\(\s*\$_(POST|REQUEST|GET)\s*\[")
    assert not regex_guard.has_nested_quantifier(r"(abc)+def")
    assert regex_guard.check_pattern("a" * 600) is not None
    assert regex_guard.check_pattern("[a-z]+") is None


def test_previews_refuse_a_catastrophic_regex_without_hanging() -> None:
    import time

    started = time.monotonic()
    yara = 'rule R { strings: $a = /(a+)+$/ condition: $a }'
    result = yara_lite.evaluate(yara, "a" * 5000 + "!")
    assert result.unsupported and "too complex" in result.unsupported
    suricata = 'alert http any any -> any any (msg:"x"; http.uri; pcre:"/(a+)+$/"; sid:1;)'
    with pytest.raises(suricata_lite.SuricataError, match="too complex"):
        suricata_lite.evaluate(suricata, {"cs-uri-stem": "a" * 5000 + "!"})
    assert time.monotonic() - started < 2


def test_suricata_parser_rejects_malformed_rules_and_oversized_input() -> None:
    for bad in ["", "alert http any any", "alert http any any -> any any", "bogus http any any -> any any (msg:\"m\"; sid:1;)", 'alert http any any -> any any (content:"x";)']:
        with pytest.raises(suricata_lite.SuricataError):
            suricata_lite.parse(bad)
    with pytest.raises(suricata_lite.SuricataError, match="longer than"):
        suricata_lite.parse('alert http any any -> any any (msg:"' + "a" * 9000 + '"; sid:1;)')
