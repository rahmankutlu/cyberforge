"""File-based unit tests for detection rules.

A Sigma rule can ship with a tests file next to it:

    detections/sigma/windows/win-encoded-powershell-command.yml
    detections/sigma/windows/win-encoded-powershell-command.tests.yml

or, for the directory layout, `<slug>/rule.yml` with `<slug>/tests.yml`. The file is a list of
cases. A case is one event (`event`, a flat field mapping) or a sequence of events (`events`, each
with an optional time offset, so burst and sequence-based correlation rules can be tested), plus the
expected outcome. This module discovers those files, validates them against a strict schema, runs
them through the same engine the SOC uses, and reports the result.

Nothing here executes rule content: events are plain data and the engine only evaluates conditions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from cyberforge.content.loader import (
    ContentBundle,
    LoadedRule,
    is_tests_file,
    sigma_slug,
    sigma_tests_path,
)
from cyberforge.services import simulation, telemetry
from cyberforge.services.sigma_engine import (
    CompiledRule,
    EvalEvent,
    SigmaEngine,
    SigmaEngineError,
    compile_rule,
    match_event,
)

MAX_TESTS_FILE_BYTES = 256 * 1024
MAX_EVENTS_PER_CASE = 1000
T0 = datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC)


# --- schema -------------------------------------------------------------------------------------


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RuleTestEvent(_Strict):
    """One event (or a burst of them, via `repeat`/`every`) inside a multi-event test case.

    `{i}`, `{i+N}` and `{i*N}` inside string values are replaced by the repeat index, exactly as in
    lab scenarios.
    """

    t: float = Field(0, ge=0, description="Seconds from the start of the case")
    repeat: int = Field(1, ge=1, le=500)
    every: float = Field(1.0, ge=0, description="Seconds between repeats")
    category: str | None = Field(None, description="Telemetry category; picks the logsource")
    logsource: dict[str, str] | None = None
    fields: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _category_known(self) -> RuleTestEvent:
        if self.category and not telemetry.known_category(self.category):
            raise ValueError(f"unknown telemetry category {self.category!r}")
        return self


class RuleTestCase(_Strict):
    name: str = Field(min_length=3, max_length=120)
    description: str | None = None
    event: dict[str, Any] | None = Field(None, description="A single event as flat fields")
    events: list[RuleTestEvent] | None = None
    category: str | None = Field(
        None, description="Default telemetry category for the events; omit to use the rule's own"
    )
    expected: bool = Field(description="True if the rule must fire, false if it must stay quiet")
    matches: list[int] | None = Field(
        None,
        description="Exact 0-based indexes of the events that must match (single-event rules)",
    )
    hits: int | None = Field(
        None, ge=0, description="Exact number of correlation hits (correlation rules)"
    )

    @model_validator(mode="after")
    def _shape(self) -> RuleTestCase:
        if (self.event is None) == (self.events is None):
            raise ValueError("provide exactly one of `event` and `events`")
        if self.events is not None and not self.events:
            raise ValueError("`events` must not be empty")
        if self.category and not telemetry.known_category(self.category):
            raise ValueError(f"unknown telemetry category {self.category!r}")
        if self.matches is not None and not self.expected and self.matches:
            raise ValueError("`matches` lists matching events, so it requires `expected: true`")
        if self.hits is not None and self.hits > 0 and not self.expected:
            raise ValueError("`hits` above zero requires `expected: true`")
        return self


class RuleTestFile(_Strict):
    tests: list[RuleTestCase] = Field(min_length=1)

    @model_validator(mode="after")
    def _unique_names(self) -> RuleTestFile:
        seen: set[str] = set()
        for case in self.tests:
            if case.name in seen:
                raise ValueError(f"duplicate test name {case.name!r}")
            seen.add(case.name)
        return self


# --- results ------------------------------------------------------------------------------------


@dataclass
class CaseResult:
    name: str
    expected: bool
    passed: bool
    actual: bool
    message: str = ""
    matched_events: list[int] = field(default_factory=list)
    hits: int = 0
    definition: dict[str, Any] = field(default_factory=dict)  # the case as written in the file

    @property
    def positive(self) -> bool:
        return self.expected


@dataclass
class RuleTestReport:
    slug: str
    rule_path: str
    tests_path: str | None
    cases: list[CaseResult] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)  # schema / compile problems for the file

    @property
    def passed(self) -> bool:
        return not self.errors and all(c.passed for c in self.cases)

    @property
    def failures(self) -> list[CaseResult]:
        return [c for c in self.cases if not c.passed]

    @property
    def positives(self) -> int:
        return sum(1 for c in self.cases if c.expected)

    @property
    def negatives(self) -> int:
        return sum(1 for c in self.cases if not c.expected)

    @property
    def is_tested(self) -> bool:
        """Tested = a valid tests file with at least one positive and one negative case."""
        return not self.errors and self.positives > 0 and self.negatives > 0


@dataclass
class RunSummary:
    reports: list[RuleTestReport]
    orphans: list[str]  # tests files that do not belong to any rule

    @property
    def rule_count(self) -> int:
        return len(self.reports)

    @property
    def test_count(self) -> int:
        return sum(len(r.cases) for r in self.reports)

    @property
    def failure_count(self) -> int:
        return sum(len(r.failures) for r in self.reports)

    @property
    def error_count(self) -> int:
        return sum(len(r.errors) for r in self.reports) + len(self.orphans)

    @property
    def ok(self) -> bool:
        return self.failure_count == 0 and self.error_count == 0

    @property
    def tested_rules(self) -> int:
        return sum(1 for r in self.reports if r.is_tested)

    @property
    def coverage_percent(self) -> int:
        return round(100 * self.tested_rules / self.rule_count) if self.rule_count else 0

    def report_for(self, slug: str) -> RuleTestReport | None:
        return next((r for r in self.reports if r.slug == slug), None)


# --- execution ----------------------------------------------------------------------------------


def _logsource_for(category: str | None, explicit: dict[str, str] | None) -> dict[str, str] | None:
    if explicit:
        return dict(explicit)
    if category:
        return dict(telemetry.CATEGORIES[category].logsource)
    return None


def build_events(case: RuleTestCase, rule: CompiledRule) -> list[EvalEvent]:
    """Turn a case into engine events. Unless told otherwise, events share the rule's logsource."""
    default_ls = _logsource_for(case.category, None) or dict(rule.logsource)
    if case.event is not None:
        return [EvalEvent(0, T0, dict(case.event), default_ls)]
    events: list[EvalEvent] = []
    for spec in case.events or []:
        ls = _logsource_for(spec.category, spec.logsource) or default_ls
        for i in range(spec.repeat):
            events.append(
                EvalEvent(
                    len(events),
                    T0 + timedelta(seconds=spec.t + i * spec.every),
                    simulation.fill_template(spec.fields, i),
                    ls,
                )
            )
    if len(events) > MAX_EVENTS_PER_CASE:
        raise ValueError(f"a case may expand to at most {MAX_EVENTS_PER_CASE} events")
    return events


def run_case(case: RuleTestCase, rule: CompiledRule) -> CaseResult:
    try:
        events = build_events(case, rule)
    except ValueError as exc:
        return CaseResult(case.name, case.expected, False, False, str(exc))

    if rule.is_correlation:
        hits = SigmaEngine([rule]).evaluate(events)
        actual, matched, hit_count = bool(hits), sorted({e.id or 0 for h in hits for e in h.events}), len(hits)
    else:
        matched = [i for i, e in enumerate(events) if match_event(rule, e)[0]]
        actual, hit_count = bool(matched), len(matched)

    problems: list[str] = []
    if actual != case.expected:
        problems.append(
            f"expected the rule to {'match' if case.expected else 'stay quiet'}, "
            f"but it {'matched' if actual else 'did not match'}"
        )
        if actual and not rule.is_correlation:
            problems[-1] += f" (events {matched})"
    if case.matches is not None and not rule.is_correlation and sorted(case.matches) != matched:
        problems.append(f"expected events {sorted(case.matches)} to match, got {matched}")
    if case.hits is not None and case.hits != hit_count and rule.is_correlation:
        problems.append(f"expected {case.hits} correlation hit(s), got {hit_count}")
    if case.hits is not None and not rule.is_correlation:
        problems.append("`hits` only applies to correlation rules; use `matches`")
    if case.matches is not None and rule.is_correlation:
        problems.append("`matches` only applies to single-event rules; use `hits`")
    return CaseResult(
        case.name, case.expected, not problems, actual, "; ".join(problems), matched, hit_count
    )


def load_tests_file(path: Path) -> RuleTestFile:
    """Parse and validate a tests file. Raises ValueError with a readable message."""
    if path.stat().st_size > MAX_TESTS_FILE_BYTES:
        raise ValueError(f"tests file exceeds {MAX_TESTS_FILE_BYTES // 1024} KiB")
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise ValueError(f"YAML: {exc}") from exc
    try:
        return RuleTestFile.model_validate(data)
    except ValidationError as exc:
        lines = []
        for err in exc.errors():
            loc = ".".join(str(p) for p in err["loc"])
            lines.append(f"{loc}: {err['msg']}" if loc else err["msg"])
        raise ValueError("; ".join(lines)) from exc


def run_rule_tests(root: Path, rule: LoadedRule) -> RuleTestReport:
    report = RuleTestReport(rule.slug, rule.path, rule.tests_path)
    if rule.tests_path is None:
        return report
    try:
        tests = load_tests_file(root / rule.tests_path)
    except (ValueError, OSError) as exc:
        report.errors.append(str(exc))
        return report
    try:
        compiled = compile_rule(rule.slug, rule.content)
    except SigmaEngineError as exc:
        report.errors.append(f"rule cannot be compiled: {exc}")
        return report
    for case in tests.tests:
        result = run_case(case, compiled)
        result.definition = case.model_dump(exclude_none=True)
        report.cases.append(result)
    return report


def find_orphans(root: Path) -> list[str]:
    """Tests files whose rule does not exist (renamed or deleted rule, typo in the file name)."""
    orphans = []
    candidates = [*(root / "detections" / "sigma").rglob("*.yml"), *root.glob("labs/*/*/detections/**/*.yml")]
    for path in sorted(candidates):
        if not is_tests_file(path):
            continue
        rule_path = (
            path.with_name("rule.yml")
            if path.name == "tests.yml"
            else path.with_name(path.name.removesuffix(".tests.yml") + ".yml")
        )
        if not rule_path.is_file():
            orphans.append(path.relative_to(root).as_posix())
    return orphans


def run_all(bundle: ContentBundle, only: list[str] | None = None) -> RunSummary:
    """Run the tests of every Sigma rule (or only the given slugs)."""
    sigma = [r for r in bundle.rules if r.format == "sigma"]
    if only:
        sigma = [r for r in sigma if r.slug in only]
    reports = [run_rule_tests(bundle.root, r) for r in sigma]
    return RunSummary(reports, find_orphans(bundle.root) if not only else [])


__all__ = [
    "CaseResult",
    "RuleTestCase",
    "RuleTestEvent",
    "RuleTestFile",
    "RuleTestReport",
    "RunSummary",
    "find_orphans",
    "load_tests_file",
    "run_all",
    "run_case",
    "run_rule_tests",
    "sigma_slug",
    "sigma_tests_path",
]
