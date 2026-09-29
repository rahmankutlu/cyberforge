"""Cross-content checks shared by `pnpm validate:content` and the `cyberforge` CLI."""

from __future__ import annotations

from datetime import UTC, datetime

from cyberforge.content.loader import ContentBundle, ContentIssue
from cyberforge.services import simulation
from cyberforge.services.sigma_engine import (
    EvalEvent,
    SigmaEngine,
    SigmaEngineError,
    compile_rule,
)


def check_scenarios(bundle: ContentBundle, issues: list[ContentIssue]) -> None:
    """Each lab's scenario must fire exactly the rules its lab.yaml declares."""
    compiled = {}
    for rule in bundle.rules:
        if rule.format != "sigma":
            continue
        try:
            compiled[rule.slug] = compile_rule(rule.slug, rule.content)
        except SigmaEngineError as exc:
            issues.append(ContentIssue(rule.path, f"rule cannot be evaluated: {exc}"))
    engine = SigmaEngine(compiled.values())
    start = datetime(2026, 1, 1, tzinfo=UTC)
    for lab in bundle.labs:
        rows = simulation.materialize(lab.scenario, start)
        events = [
            EvalEvent(i, r["timestamp"], r["fields"], r["logsource"]) for i, r in enumerate(rows)
        ]
        fired = {h.rule.slug for h in engine.evaluate(events)}
        expected = set(lab.doc.expected_detection.rules)
        where = f"labs/{lab.doc.domain}/{lab.doc.slug}"
        for slug in sorted(expected - fired):
            issues.append(ContentIssue(where, f"scenario does not trigger declared rule {slug!r}"))
        for slug in sorted(fired - expected):
            issues.append(
                ContentIssue(
                    where, f"scenario also triggers undeclared rule {slug!r}", level="warning"
                )
            )


def check_stories(bundle: ContentBundle) -> list[ContentIssue]:
    """Story checks arrive with story mode; until then there is nothing to report."""
    return []


def check_datasets(bundle: ContentBundle) -> list[ContentIssue]:
    """Each playground dataset must trigger every rule it lists in `expected_rules`."""
    from cyberforge.services import playground

    issues: list[ContentIssue] = []
    for ds in bundle.playground_datasets:
        where = f"datasets/playground/{ds.slug}.yaml"
        try:
            fired = playground.rules_fired(bundle.rules, ds)
        except playground.PlaygroundError as exc:
            issues.append(ContentIssue(where, str(exc)))
            continue
        for slug in ds.expected_rules:
            if slug not in fired:
                issues.append(ContentIssue(where, f"dataset does not trigger expected rule {slug!r}"))
    return issues
