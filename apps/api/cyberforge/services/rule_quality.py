"""Deterministic detection-quality checks. No scoring model: seven yes/no questions per rule.

    schema valid          pySigma parses the rule and reports no errors
    MITRE mapped          at least one ATT&CK / ATLAS tag, and every tag is a known technique
    has description       a non-empty description
    false-positive notes  `falsepositives` documents what benign activity to expect
    positive tests        a valid tests file with at least one case that must match
    negative tests        ... and at least one case that must not
    translation verified  translates to a SIEM backend, and every backend that refuses does so
                          with a declared "not supported" (never an unexpected error)
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

from cyberforge.content.loader import ContentBundle, LoadedRule
from cyberforge.services import sigma_service
from cyberforge.services.rule_tests import RuleTestReport, RunSummary

CHECKS: list[tuple[str, str]] = [
    ("schema_valid", "Schema valid"),
    ("mitre_mapped", "MITRE mapped"),
    ("has_description", "Has description"),
    ("has_false_positives", "Has false-positive notes"),
    ("has_positive_tests", "Has positive tests"),
    ("has_negative_tests", "Has negative tests"),
    ("translation_verified", "Translation verified"),
]

_SIEM_TARGETS = ["elastic", "splunk", "sentinel", "opensearch"]
_DECLARED_UNSUPPORTED = ("NotImplementedError", "SigmaFeatureNotSupportedByBackendError")


@dataclass
class Check:
    id: str
    label: str
    passed: bool
    detail: str = ""


@dataclass
class RuleQuality:
    slug: str
    title: str
    checks: list[Check]

    @property
    def passed(self) -> int:
        return sum(c.passed for c in self.checks)

    @property
    def total(self) -> int:
        return len(self.checks)


@lru_cache(maxsize=512)
def _translation_check(content: str) -> tuple[bool, str]:
    try:
        results = list(sigma_service.translate(content, _SIEM_TARGETS))
    except Exception as exc:  # malformed rules are reported by the schema check
        return False, f"{type(exc).__name__}: {exc}"
    ok = [t.target for t in results if not t.error]
    unexpected = [
        f"{t.target}: {t.error}"
        for t in results
        if t.error and not t.error.startswith(_DECLARED_UNSUPPORTED)
    ]
    if unexpected:
        return False, "; ".join(unexpected)
    if not ok:
        return False, "no SIEM backend can express this rule"
    return True, "translates to " + ", ".join(ok)


def evaluate(
    rule: LoadedRule, tests: RuleTestReport | None, known_techniques: set[str], schema_errors: int
) -> RuleQuality:
    valid_tests = tests is not None and not tests.errors
    positives = tests.positives if valid_tests and tests else 0
    negatives = tests.negatives if valid_tests and tests else 0
    unknown = [t for t in rule.technique_ids if t not in known_techniques]
    translated, translation_detail = _translation_check(rule.content)
    checks = [
        Check("schema_valid", "Schema valid", schema_errors == 0),
        Check(
            "mitre_mapped",
            "MITRE mapped",
            bool(rule.technique_ids) and not unknown,
            f"unknown: {', '.join(unknown)}" if unknown else "",
        ),
        Check("has_description", "Has description", bool(rule.description.strip())),
        Check("has_false_positives", "Has false-positive notes", bool(rule.false_positives)),
        Check("has_positive_tests", "Has positive tests", positives > 0, f"{positives} case(s)"),
        Check("has_negative_tests", "Has negative tests", negatives > 0, f"{negatives} case(s)"),
        Check("translation_verified", "Translation verified", translated, translation_detail),
    ]
    return RuleQuality(rule.slug, rule.title, checks)


def evaluate_all(bundle: ContentBundle, summary: RunSummary) -> list[RuleQuality]:
    known = {t["id"] for t in bundle.mitre_techniques}
    errors_by_path: dict[str, int] = {}
    for issue in bundle.errors:
        errors_by_path[issue.path] = errors_by_path.get(issue.path, 0) + 1
    return [
        evaluate(r, summary.report_for(r.slug), known, errors_by_path.get(r.path, 0))
        for r in bundle.rules
        if r.format == "sigma"
    ]
