"""Sigma engine semantics, validation and translation."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from cyberforge.services import sigma_service
from cyberforge.services.sigma_engine import (
    EvalEvent,
    SigmaEngine,
    SigmaEngineError,
    compile_rule,
    match_event,
)

T0 = datetime(2026, 9, 29, 12, 0, tzinfo=UTC)


def rule(detection: str, logsource: str = "product: test") -> str:
    return f"""
title: t
id: 11111111-1111-4111-8111-111111111111
status: test
logsource: {{{logsource}}}
detection:
{detection}
level: low
"""


def ev(fields: dict, **logsource: str) -> EvalEvent:
    return EvalEvent(1, T0, fields, logsource or {"product": "test"})


def matches(detection: str, fields: dict) -> bool:
    return match_event(compile_rule("r", rule(detection)), ev(fields))[0]


def test_contains_is_case_insensitive_and_supports_lists() -> None:
    det = "  sel:\n    Cmd|contains:\n      - 'FOO'\n      - 'bar'\n  condition: sel"
    assert matches(det, {"Cmd": "xx foo xx"})
    assert matches(det, {"Cmd": "BAR"})
    assert not matches(det, {"Cmd": "baz"})


def test_contains_all_requires_every_value() -> None:
    det = "  sel:\n    Cmd|contains|all:\n      - 'a'\n      - 'b'\n  condition: sel"
    assert matches(det, {"Cmd": "ab"})
    assert not matches(det, {"Cmd": "a"})


def test_startswith_endswith_and_wildcards() -> None:
    det = "  sel:\n    P|endswith: '.exe'\n    Q: 'ab*d?f'\n  condition: sel"
    assert matches(det, {"P": "x.EXE", "Q": "abXXdZf"})
    assert not matches(det, {"P": "x.exe", "Q": "abXXdf"})


def test_regex_is_case_sensitive_by_default_and_searches() -> None:
    det = "  sel:\n    Q|re: '^[a-z]{3}[0-9]+'\n  condition: sel"
    assert matches(det, {"Q": "abc123"})
    assert not matches(det, {"Q": "ABC123"})


def test_cidr_number_comparison_and_null() -> None:
    assert matches("  sel:\n    Ip|cidr: '10.0.0.0/8'\n  condition: sel", {"Ip": "10.2.3.4"})
    assert not matches("  sel:\n    Ip|cidr: '10.0.0.0/8'\n  condition: sel", {"Ip": "11.2.3.4"})
    assert matches("  sel:\n    Port|gte: 1024\n  condition: sel", {"Port": "2000"})
    assert not matches("  sel:\n    Port|gte: 1024\n  condition: sel", {"Port": 80})
    assert matches("  sel:\n    X: null\n  condition: sel", {"Y": 1})


def test_not_and_selector_conditions() -> None:
    det = "  sel_a:\n    A: 1\n  sel_b:\n    B: 2\n  filt:\n    C: 3\n  condition: 1 of sel_* and not filt"
    assert matches(det, {"A": 1})
    assert matches(det, {"B": 2})
    assert not matches(det, {"A": 1, "C": 3})
    assert not matches(det, {"X": 0})


def test_keyword_search_scans_all_fields() -> None:
    det = "  keywords:\n    - 'needle'\n  condition: keywords"
    assert matches(det, {"whatever": "hay needle hay"})
    assert not matches(det, {"whatever": "hay"})


def test_list_valued_fields_match_any_element() -> None:
    det = "  sel:\n    flags: 'blocked'\n  condition: sel"
    assert matches(det, {"flags": ["ok", "blocked"]})
    assert not matches(det, {"flags": ["ok"]})


def test_dotted_and_nested_field_lookup() -> None:
    det = "  sel:\n    a.b: 'x'\n  condition: sel"
    assert matches(det, {"a.b": "x"})
    assert matches(det, {"a": {"b": "x"}})


def test_fieldref_compares_two_fields() -> None:
    det = "  sel:\n    Target|fieldref: 'Caller'\n  condition: sel"
    assert matches(det, {"Target": "bob", "Caller": "BOB"})
    assert not matches(det, {"Target": "bob", "Caller": "alice"})


def test_logsource_must_be_compatible() -> None:
    compiled = compile_rule(
        "r",
        rule("  sel:\n    A: 1\n  condition: sel", "product: windows, category: process_creation"),
    )
    assert not match_event(compiled, ev({"A": 1}, product="linux"))[0]
    assert match_event(compiled, ev({"A": 1}, product="windows", category="process_creation"))[0]


def test_match_trace_reports_field_and_pattern() -> None:
    ok, trace = match_event(
        compile_rule("r", rule("  sel:\n    Cmd|contains: 'abc'\n  condition: sel")),
        ev({"Cmd": "xabcx"}),
    )
    assert ok and trace[0]["field"] == "Cmd" and trace[0]["pattern"] == "*abc*"


CORR = """
title: base
id: 22222222-2222-4222-8222-222222222222
name: base_rule
logsource: {product: test}
detection:
  sel:
    Kind: fail
  condition: sel
---
title: burst
id: 33333333-3333-4333-8333-333333333333
correlation:
  type: %s
  rules: [base_rule]
  group-by: [Src]
  timespan: 1m
  condition: {%s}
level: high
"""


def corr_events(n: int, src: str = "a", spread: int = 1, port: bool = False) -> list[EvalEvent]:
    return [
        EvalEvent(
            i,
            T0 + timedelta(seconds=i * spread),
            {"Kind": "fail", "Src": src, "Port": i if port else 1},
            {"product": "test"},
        )
        for i in range(n)
    ]


def test_event_count_correlation_groups_by_field_and_respects_window() -> None:
    compiled = compile_rule("c", CORR % ("event_count", "gte: 5"))
    engine = SigmaEngine([compiled])
    assert len(engine.evaluate(corr_events(6))) == 1
    assert engine.evaluate(corr_events(4)) == []
    assert engine.evaluate(corr_events(6, spread=30)) == []  # too slow to fit five in a minute
    mixed = corr_events(3, "a") + [
        EvalEvent(
            10 + i, T0 + timedelta(seconds=i), {"Kind": "fail", "Src": "b"}, {"product": "test"}
        )
        for i in range(3)
    ]
    assert engine.evaluate(mixed) == []  # 3 + 3 across two sources never reaches 5 for one


def test_value_count_counts_distinct_values() -> None:
    compiled = compile_rule("c", CORR % ("value_count", "gte: 4, field: Port"))
    engine = SigmaEngine([compiled])
    assert len(engine.evaluate(corr_events(5, port=True))) == 1
    assert engine.evaluate(corr_events(8, port=False)) == []  # same value repeated


def test_temporal_ordered_requires_sequence() -> None:
    text = """
title: a
id: 44444444-4444-4444-8444-444444444444
name: first
logsource: {product: test}
detection: {s: {K: one}, condition: s}
---
title: b
id: 55555555-5555-4555-8555-555555555555
name: second
logsource: {product: test}
detection: {s: {K: two}, condition: s}
---
title: seq
id: 66666666-6666-4666-8666-666666666666
correlation: {type: temporal_ordered, rules: [first, second], group-by: [Src], timespan: 5m}
level: high
"""
    engine = SigmaEngine([compile_rule("t", text)])
    one = EvalEvent(1, T0, {"K": "one", "Src": "x"}, {"product": "test"})
    two = EvalEvent(2, T0 + timedelta(seconds=30), {"K": "two", "Src": "x"}, {"product": "test"})
    assert len(engine.evaluate([one, two])) == 1
    assert (
        engine.evaluate([EvalEvent(1, T0 + timedelta(seconds=60), one.fields, one.logsource), two])
        == []
    )


def test_invalid_rule_raises_engine_error() -> None:
    with pytest.raises(SigmaEngineError):
        compile_rule(
            "bad",
            "title: x\nlogsource: {product: t}\ndetection:\n  sel: {A|nope: 1}\n  condition: sel\n",
        )


# --- validation and translation --------------------------------------------------------------


GOOD = rule(
    "  sel:\n    Image|endswith: '.exe'\n  condition: sel",
    "category: process_creation, product: windows",
).replace(
    "level: low", "level: high\ntags: [attack.t1059.001]\ndescription: d\nfalsepositives: [x]"
)


def test_validate_reports_metadata_fields_and_mitre() -> None:
    report = sigma_service.validate(GOOD, {"T1059.001"})
    assert report.valid and report.meta
    assert report.meta.techniques == ["T1059.001"] and report.meta.fields == ["Image"]
    assert not report.warnings


def test_validate_flags_syntax_and_condition_errors() -> None:
    assert not sigma_service.validate("title: [unclosed").valid
    assert not sigma_service.validate("- just\n- a list").valid
    bad_mod = sigma_service.validate(rule("  sel:\n    A|bogus: 1\n  condition: sel"))
    assert not bad_mod.valid and any("bogus" in e for e in bad_mod.errors)
    dangling = sigma_service.validate(rule("  sel:\n    A: 1\n  condition: nope"))
    assert not dangling.valid


def test_validate_warns_about_unknown_technique() -> None:
    report = sigma_service.validate(GOOD, set())
    assert report.valid and any("T1059.001" in w for w in report.warnings)


def test_validate_rejects_oversized_rules() -> None:
    assert not sigma_service.validate("title: x\n" + "#" * 70_000).valid


def test_translation_targets_and_field_names() -> None:
    results = {t.target: t for t in sigma_service.translate(GOOD)}
    assert set(results) == {"elastic", "splunk", "sentinel", "opensearch", "sql"}
    assert all(not r.error and r.queries for r in results.values())
    assert "Image" in results["splunk"].queries[0]
    assert "endswith" in results["sentinel"].queries[0]
    assert results["sql"].queries[0].startswith("SELECT *\nFROM events\nWHERE")


def test_sql_translation_of_correlation_uses_group_by_having() -> None:
    query = sigma_service.translate(CORR % ("event_count", "gte: 5"), ["sql"])[0].queries[0]
    assert "GROUP BY" in query and "HAVING COUNT(*) >= 5" in query


def test_unknown_translation_target_is_rejected() -> None:
    with pytest.raises(ValueError):
        sigma_service.translate(GOOD, ["nope"])
