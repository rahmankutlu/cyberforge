"""The rule-test framework: schema, execution semantics, discovery and the shipped tests."""

from __future__ import annotations

from pathlib import Path
from textwrap import dedent

import pytest

from cyberforge import cli
from cyberforge.config import get_settings
from cyberforge.content.loader import ContentBundle, LoadedRule, load_bundle
from cyberforge.services import rule_quality, rule_tests
from cyberforge.services.rule_tests import RuleTestCase, RuleTestFile
from cyberforge.services.sigma_engine import compile_rule

RULE = dedent(
    """\
    title: Encoded PowerShell
    id: 11111111-1111-4111-8111-111111111111
    status: test
    description: test rule
    logsource:
      category: process_creation
      product: windows
    detection:
      selection:
        Image|endswith: '\\powershell.exe'
        CommandLine|contains: ' -enc '
      condition: selection
    falsepositives:
      - management tooling
    tags:
      - attack.t1059.001
    level: high
    """
)

BURST = dedent(
    """\
    title: Failed logon
    id: 22222222-2222-4222-8222-222222222222
    name: failed
    status: test
    logsource: {product: windows, service: security}
    detection:
      selection: {EventID: 4625}
      condition: selection
    level: low
    ---
    title: Failed logon burst
    id: 33333333-3333-4333-8333-333333333333
    status: test
    correlation:
      type: event_count
      rules: [failed]
      group-by: [IpAddress]
      timespan: 1m
      condition: {gte: 3}
    level: high
    """
)


def case(**kwargs: object) -> RuleTestCase:
    return RuleTestCase.model_validate(kwargs)


# --- schema -------------------------------------------------------------------------------------


def test_case_needs_exactly_one_of_event_and_events() -> None:
    with pytest.raises(ValueError, match="exactly one"):
        case(name="both given", event={"a": 1}, events=[{"fields": {}}], expected=True)
    with pytest.raises(ValueError, match="exactly one"):
        case(name="neither given", expected=True)


def test_unknown_keys_and_categories_are_rejected() -> None:
    with pytest.raises(ValueError):
        case(name="typo in key", event={"a": 1}, expcted=True)
    with pytest.raises(ValueError, match="unknown telemetry category"):
        case(name="bad category", event={"a": 1}, category="not_a_category", expected=True)


def test_matches_requires_expected_true() -> None:
    with pytest.raises(ValueError, match="requires"):
        case(name="contradiction", event={"a": 1}, expected=False, matches=[0])


def test_duplicate_names_are_rejected() -> None:
    with pytest.raises(ValueError, match="duplicate"):
        RuleTestFile.model_validate(
            {
                "tests": [
                    {"name": "same name", "event": {"a": 1}, "expected": True},
                    {"name": "same name", "event": {"a": 2}, "expected": False},
                ]
            }
        )


# --- execution ----------------------------------------------------------------------------------


def test_positive_and_negative_cases() -> None:
    rule = compile_rule("r", RULE)
    hit = case(
        name="hit",
        event={"Image": "C:\\Windows\\powershell.exe", "CommandLine": "powershell.exe -enc AAA"},
        expected=True,
    )
    miss = case(
        name="miss",
        event={"Image": "C:\\Windows\\powershell.exe", "CommandLine": "Get-Process"},
        expected=False,
    )
    assert rule_tests.run_case(hit, rule).passed
    assert rule_tests.run_case(miss, rule).passed


def test_wrong_expectation_fails_with_a_readable_message() -> None:
    rule = compile_rule("r", RULE)
    wrong = case(name="wrong", event={"Image": "x.exe", "CommandLine": "nothing"}, expected=True)
    result = rule_tests.run_case(wrong, rule)
    assert not result.passed
    assert "expected the rule to match" in result.message


def test_negative_test_fails_when_the_rule_matches() -> None:
    rule = compile_rule("r", RULE)
    unexpected = case(
        name="unexpected",
        event={"Image": "C:\\x\\powershell.exe", "CommandLine": "powershell.exe -enc AAA"},
        expected=False,
    )
    result = rule_tests.run_case(unexpected, rule)
    assert not result.passed
    assert "stay quiet" in result.message


def test_events_use_the_rules_logsource_unless_overridden() -> None:
    rule = compile_rule("r", RULE)
    fields = {"Image": "C:\\x\\powershell.exe", "CommandLine": "powershell.exe -enc AAA"}
    assert rule_tests.run_case(case(name="default", event=fields, expected=True), rule).passed
    other = case(name="other logsource", event=fields, category="dns_query", expected=False)
    assert rule_tests.run_case(other, rule).passed


def test_matches_pins_exactly_which_events_match() -> None:
    rule = compile_rule("r", RULE)
    hit = {"Image": "C:\\x\\powershell.exe", "CommandLine": "powershell.exe -enc AAA"}
    quiet = {"Image": "C:\\x\\powershell.exe", "CommandLine": "Get-Date"}
    events = [{"fields": quiet}, {"fields": hit}, {"fields": quiet}]
    assert rule_tests.run_case(
        case(name="second matches", events=events, expected=True, matches=[1]), rule
    ).passed
    assert not rule_tests.run_case(
        case(name="first matches", events=events, expected=True, matches=[0]), rule
    ).passed


def test_correlation_bursts_and_thresholds() -> None:
    rule = compile_rule("burst", BURST)
    three = [{"repeat": 3, "every": 5, "fields": {"EventID": 4625, "IpAddress": "203.0.113.5"}}]
    two = [{"repeat": 2, "every": 5, "fields": {"EventID": 4625, "IpAddress": "203.0.113.5"}}]
    assert rule_tests.run_case(case(name="at threshold", events=three, expected=True, hits=1), rule).passed
    assert rule_tests.run_case(case(name="below", events=two, expected=False), rule).passed


def test_repeat_templates_produce_distinct_values() -> None:
    rule = compile_rule("burst", BURST)
    built = rule_tests.build_events(
        case(
            name="templated",
            events=[{"repeat": 3, "fields": {"IpAddress": "10.0.0.{i+1}"}}],
            expected=False,
        ),
        rule,
    )
    assert [e.fields["IpAddress"] for e in built] == ["10.0.0.1", "10.0.0.2", "10.0.0.3"]


# --- files on disk ------------------------------------------------------------------------------


def _write_rule(root: Path, tests_yaml: str | None) -> LoadedRule:
    sigma = root / "detections" / "sigma" / "windows"
    sigma.mkdir(parents=True)
    (sigma / "win-test-rule.yml").write_text(RULE, encoding="utf-8")
    tests_rel = None
    if tests_yaml is not None:
        (sigma / "win-test-rule.tests.yml").write_text(tests_yaml, encoding="utf-8")
        tests_rel = "detections/sigma/windows/win-test-rule.tests.yml"
    return LoadedRule(
        slug="win-test-rule", format="sigma", title="t", level="high", status="test",
        description="d", content=RULE, logsource={}, tags=[], technique_ids=[], false_positives=[],
        references=[], author="a", is_correlation=False,
        path="detections/sigma/windows/win-test-rule.yml", tests_path=tests_rel,
    )  # fmt: skip


def test_report_for_a_valid_tests_file(tmp_path: Path) -> None:
    rule = _write_rule(
        tmp_path,
        dedent(
            """\
            tests:
              - name: encoded is detected
                event: {Image: 'C:\\a\\powershell.exe', CommandLine: 'powershell.exe -enc X'}
                expected: true
              - name: plain is ignored
                event: {Image: 'C:\\a\\powershell.exe', CommandLine: 'Get-Date'}
                expected: false
            """
        ),
    )
    report = rule_tests.run_rule_tests(tmp_path, rule)
    assert report.passed and report.is_tested
    assert (report.positives, report.negatives) == (1, 1)


def test_schema_errors_are_reported_not_raised(tmp_path: Path) -> None:
    rule = _write_rule(tmp_path, "tests:\n  - name: no expectation\n    event: {a: 1}\n")
    report = rule_tests.run_rule_tests(tmp_path, rule)
    assert not report.passed
    assert "expected" in report.errors[0]


def test_invalid_yaml_is_reported(tmp_path: Path) -> None:
    rule = _write_rule(tmp_path, "tests: [unclosed\n")
    assert rule_tests.run_rule_tests(tmp_path, rule).errors[0].startswith("YAML")


def test_a_rule_with_only_positive_tests_is_not_counted_as_tested(tmp_path: Path) -> None:
    rule = _write_rule(
        tmp_path,
        "tests:\n  - name: only positive\n"
        "    event: {Image: 'C:\\a\\powershell.exe', CommandLine: 'powershell.exe -enc X'}\n"
        "    expected: true\n",
    )
    report = rule_tests.run_rule_tests(tmp_path, rule)
    assert report.passed and not report.is_tested


def test_missing_tests_file_is_neither_pass_nor_error(tmp_path: Path) -> None:
    report = rule_tests.run_rule_tests(tmp_path, _write_rule(tmp_path, None))
    assert report.cases == [] and report.errors == [] and not report.is_tested


def test_orphaned_tests_files_are_found(tmp_path: Path) -> None:
    _write_rule(tmp_path, None)
    orphan = tmp_path / "detections" / "sigma" / "windows" / "renamed-rule.tests.yml"
    orphan.write_text("tests: []\n", encoding="utf-8")
    assert rule_tests.find_orphans(tmp_path) == [
        "detections/sigma/windows/renamed-rule.tests.yml"
    ]


# --- the shipped rules --------------------------------------------------------------------------


def test_every_shipped_rule_passes_its_tests(bundle: ContentBundle) -> None:
    summary = rule_tests.run_all(bundle)
    problems = [f"{r.slug}: {e}" for r in summary.reports for e in r.errors]
    problems += [f"{r.slug}: {c.name}: {c.message}" for r in summary.reports for c in r.failures]
    assert problems == []
    assert summary.orphans == []


def test_every_shipped_sigma_rule_has_positive_and_negative_tests(bundle: ContentBundle) -> None:
    summary = rule_tests.run_all(bundle)
    untested = [r.slug for r in summary.reports if not r.is_tested]
    assert untested == [], "add <slug>.tests.yml beside these rules"
    assert summary.coverage_percent == 100


def test_quality_checks_are_deterministic_and_cover_all_seven(bundle: ContentBundle) -> None:
    summary = rule_tests.run_all(bundle)
    first = rule_quality.evaluate_all(bundle, summary)
    second = rule_quality.evaluate_all(bundle, summary)
    assert [(q.slug, q.passed) for q in first] == [(q.slug, q.passed) for q in second]
    assert all(q.total == len(rule_quality.CHECKS) == 7 for q in first)
    rule = next(q for q in first if q.slug == "win-encoded-powershell-command")
    assert rule.passed == 7


# --- the CLI ------------------------------------------------------------------------------------


def test_cli_detection_tests_exit_zero_on_the_repository(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["detections", "test", "--require-tests"]) == 0
    out = capsys.readouterr().out
    assert "0 failures" in out
    assert "Detection test coverage: 55/55 rules (100%)" in out


def test_cli_can_scope_to_one_rule(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["detections", "test", "--rule", "win-security-log-cleared"]) == 0
    out = capsys.readouterr().out
    assert "1 rule" in out and "win-security-log-cleared" in out


def test_cli_writes_a_markdown_summary(tmp_path: Path) -> None:
    target = tmp_path / "summary.md"
    assert cli.main(["detections", "test", "--summary-file", str(target)]) == 0
    text = target.read_text(encoding="utf-8")
    assert "Detection test coverage" in text and "100%" in text


def test_cli_stats_are_generated_from_the_repository(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["content", "stats", "--json"]) == 0
    import json

    data = json.loads(capsys.readouterr().out)
    assert data["sigma_rules"] == len([r for r in load_bundle(get_settings().content_dir).rules if r.format == "sigma"])
    assert data["detection_test_coverage"]["percent"] == 100


# --- examples -----------------------------------------------------------------------------------


def test_the_custom_detection_example_is_valid_and_passes(bundle: ContentBundle) -> None:
    from cyberforge.services import sigma_service

    example = bundle.root / "examples" / "custom-detection"
    text = (example / "rule.yml").read_text(encoding="utf-8")
    known = {t["id"] for t in bundle.mitre_techniques}
    report = sigma_service.validate(text, known)
    assert report.valid and report.warnings == []
    compiled = compile_rule("example", text)
    tests = rule_tests.load_tests_file(example / "tests.yml")
    results = [rule_tests.run_case(c, compiled) for c in tests.tests]
    assert [r.message for r in results if not r.passed] == []
    assert any(r.expected for r in results) and any(not r.expected for r in results)
