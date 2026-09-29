"""Sigma evaluation engine.

pySigma parses rules, applies modifiers and resolves `condition` expressions into a boolean
tree with typed leaf values. This module evaluates that tree against events and adds
Sigma *correlation* support (event_count, value_count, temporal, temporal_ordered).

It returns a trace of which fields/patterns matched, which powers the "Detection Rule Match"
stage of the lifecycle view.
"""

from __future__ import annotations

import ipaddress
import re
from collections import defaultdict
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from functools import lru_cache
from typing import Any

from sigma.collection import SigmaCollection
from sigma.conditions import (
    ConditionAND,
    ConditionFieldEqualsValueExpression,
    ConditionNOT,
    ConditionOR,
    ConditionValueExpression,
)
from sigma.correlations import (
    SigmaCorrelationCondition,
    SigmaCorrelationRule,
    SigmaCorrelationType,
)
from sigma.correlations import (
    SigmaCorrelationConditionOperator as Op,
)
from sigma.rule import SigmaRule
from sigma.types import (
    SigmaBool,
    SigmaCasedString,
    SigmaCIDRExpression,
    SigmaCompareExpression,
    SigmaExists,
    SigmaExpansion,
    SigmaFieldReference,
    SigmaNull,
    SigmaNumber,
    SigmaRegularExpression,
    SigmaRegularExpressionFlag,
    SigmaString,
    SpecialChars,
)


class SigmaEngineError(ValueError):
    """Raised when a rule cannot be compiled for evaluation."""


@dataclass
class EvalEvent:
    """Minimal event view the engine needs; decoupled from the ORM."""

    id: int | None
    timestamp: datetime
    fields: dict[str, Any]
    logsource: dict[str, str] = field(default_factory=dict)


@dataclass
class Hit:
    rule: CompiledRule
    events: list[EvalEvent]
    trace: list[dict[str, Any]]
    group: dict[str, Any] | None = None
    details: dict[str, Any] = field(default_factory=dict)

    @property
    def timestamp(self) -> datetime:
        return max(e.timestamp for e in self.events)


@dataclass
class CompiledRule:
    slug: str
    title: str
    level: str
    logsource: dict[str, str]
    sigma: SigmaRule | SigmaCorrelationRule
    bases: list[CompiledRule] = field(default_factory=list)  # for correlation rules
    _tree: Any = None

    @property
    def is_correlation(self) -> bool:
        return isinstance(self.sigma, SigmaCorrelationRule)


# --- compilation ------------------------------------------------------------------------------


def _detection_rule(slug: str, rule: SigmaRule) -> CompiledRule:
    if not rule.detection.parsed_condition:
        raise SigmaEngineError(f"{slug}: rule has no condition")
    if len(rule.detection.parsed_condition) > 1:
        raise SigmaEngineError(f"{slug}: multiple conditions are not supported by the engine")
    logsource = {
        k: v
        for k, v in (
            ("category", rule.logsource.category),
            ("product", rule.logsource.product),
            ("service", rule.logsource.service),
        )
        if v
    }
    return CompiledRule(
        slug=slug,
        title=rule.title,
        level=rule.level.name.lower() if rule.level else "medium",
        logsource=logsource,
        sigma=rule,
        _tree=rule.detection.parsed_condition[0].parsed,
    )


def compile_rule(slug: str, text: str) -> CompiledRule:
    """Compile a Sigma document (or a detection + correlation pair) for evaluation."""
    try:
        collection = SigmaCollection.from_yaml(text)
    except Exception as exc:  # pySigma raises a family of parse errors
        raise SigmaEngineError(f"{slug}: {exc}") from exc
    if not collection.rules:
        raise SigmaEngineError(f"{slug}: no rules found")

    correlations = [r for r in collection.rules if isinstance(r, SigmaCorrelationRule)]
    detections = [r for r in collection.rules if isinstance(r, SigmaRule)]
    if correlations:
        corr = correlations[0]
        bases = [
            _detection_rule(f"{slug}:{ref.rule.name or ref.reference}", ref.rule)
            for ref in corr.referenced_rules
            if isinstance(ref.rule, SigmaRule)
        ]
        if not bases:
            raise SigmaEngineError(f"{slug}: correlation references no detection rules")
        return CompiledRule(
            slug=slug,
            title=corr.title,
            level=corr.level.name.lower() if corr.level else "medium",
            logsource=bases[0].logsource,
            sigma=corr,
            bases=bases,
        )
    return _detection_rule(slug, detections[0])


# --- value matching -----------------------------------------------------------------------


@lru_cache(maxsize=2048)
def _string_regex(parts: tuple[Any, ...], cased: bool) -> re.Pattern[str]:
    out = []
    for part in parts:
        if part is SpecialChars.WILDCARD_MULTI:
            out.append(".*")
        elif part is SpecialChars.WILDCARD_SINGLE:
            out.append(".")
        else:
            out.append(re.escape(str(part)))
    return re.compile("".join(out), re.DOTALL | (0 if cased else re.IGNORECASE))


@lru_cache(maxsize=1024)
def _user_regex(pattern: str, flags: int) -> re.Pattern[str]:
    return re.compile(pattern, flags)


def lookup(fields: dict[str, Any], name: str) -> Any:
    """Field lookup: exact key, dotted path into nested dicts, then case-insensitive key."""
    if name in fields:
        return fields[name]
    if "." in name:
        cursor: Any = fields
        for part in name.split("."):
            if not isinstance(cursor, dict) or part not in cursor:
                cursor = None
                break
            cursor = cursor[part]
        if cursor is not None:
            return cursor
    lowered = name.lower()
    for key, value in fields.items():
        if key.lower() == lowered:
            return value
    return None


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else [value]


def _to_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _describe(pattern: Any) -> str:
    if isinstance(pattern, SigmaString):
        return pattern.to_plain()
    if isinstance(pattern, SigmaRegularExpression):
        return f"re:{pattern.regexp}"
    if isinstance(pattern, SigmaCIDRExpression):
        return f"cidr:{pattern.cidr}"
    if isinstance(pattern, SigmaCompareExpression):
        return f"{pattern.op.name.lower()} {pattern.number.number}"
    if isinstance(pattern, SigmaNumber):
        return str(pattern.number)
    if isinstance(pattern, SigmaNull):
        return "null"
    if isinstance(pattern, SigmaExists):
        return f"exists={pattern.exists}"
    if isinstance(pattern, SigmaExpansion):
        return " | ".join(_describe(v) for v in pattern.values)
    return str(pattern)


def _match_one(pattern: Any, actual: Any, fields: dict[str, Any]) -> bool:
    if isinstance(pattern, SigmaExists):
        return (actual is not None) == pattern.exists
    if isinstance(pattern, SigmaNull):
        return actual is None or actual == ""
    if actual is None:
        return False
    if isinstance(pattern, SigmaExpansion):
        return any(_match_one(p, actual, fields) for p in pattern.values)
    if isinstance(pattern, SigmaString):
        cased = isinstance(pattern, SigmaCasedString)
        return bool(_string_regex(tuple(pattern.s), cased).fullmatch(str(actual)))
    if isinstance(pattern, SigmaNumber):
        left = _to_float(actual)
        return left is not None and left == float(pattern.number)
    if isinstance(pattern, SigmaBool):
        return str(actual).lower() == str(pattern.boolean).lower()
    if isinstance(pattern, SigmaRegularExpression):
        flags = 0
        if SigmaRegularExpressionFlag.IGNORECASE in pattern.flags:
            flags |= re.IGNORECASE
        if SigmaRegularExpressionFlag.MULTILINE in pattern.flags:
            flags |= re.MULTILINE
        if SigmaRegularExpressionFlag.DOTALL in pattern.flags:
            flags |= re.DOTALL
        return bool(_user_regex(str(pattern.regexp), flags).search(str(actual)))
    if isinstance(pattern, SigmaCIDRExpression):
        try:
            return ipaddress.ip_address(str(actual)) in ipaddress.ip_network(
                pattern.cidr, strict=False
            )
        except ValueError:
            return False
    if isinstance(pattern, SigmaCompareExpression):
        left = _to_float(actual)
        right = float(pattern.number.number)
        if left is None:
            return False
        return {
            pattern.CompareOperators.LT: left < right,
            pattern.CompareOperators.LTE: left <= right,
            pattern.CompareOperators.GT: left > right,
            pattern.CompareOperators.GTE: left >= right,
            pattern.CompareOperators.NEQ: left != right,
        }[pattern.op]
    if isinstance(pattern, SigmaFieldReference):
        other = lookup(fields, pattern.field)
        return other is not None and str(other).lower() == str(actual).lower()
    raise SigmaEngineError(f"unsupported Sigma value type: {type(pattern).__name__}")


def _match_field(pattern: Any, name: str, fields: dict[str, Any]) -> tuple[bool, Any]:
    actual = lookup(fields, name)
    if isinstance(pattern, (SigmaNull, SigmaExists)):
        return _match_one(pattern, actual, fields), actual
    for candidate in _as_list(actual) if actual is not None else [None]:
        if _match_one(pattern, candidate, fields):
            return True, candidate
    return False, actual


def _match_keyword(pattern: Any, fields: dict[str, Any]) -> tuple[bool, Any]:
    needle = pattern
    if isinstance(pattern, SigmaString) and not pattern.contains_special():
        needle = SigmaString("*") + pattern + SigmaString("*")
    for key, value in fields.items():
        for candidate in _as_list(value):
            if isinstance(candidate, (str, int, float)) and _match_one(needle, candidate, fields):
                return True, {key: candidate}
    return False, None


def _evaluate(node: Any, fields: dict[str, Any]) -> tuple[bool, list[dict[str, Any]]]:
    if isinstance(node, ConditionAND):
        traces: list[dict[str, Any]] = []
        for arg in node.args:
            ok, tr = _evaluate(arg, fields)
            if not ok:
                return False, []
            traces.extend(tr)
        return True, traces
    if isinstance(node, ConditionOR):
        for arg in node.args:
            ok, tr = _evaluate(arg, fields)
            if ok:
                return True, tr
        return False, []
    if isinstance(node, ConditionNOT):
        ok, _ = _evaluate(node.args[0], fields)
        return (not ok), []
    if isinstance(node, ConditionFieldEqualsValueExpression):
        ok, actual = _match_field(node.value, node.field, fields)
        if not ok:
            return False, []
        return True, [
            {"field": node.field, "value": _clip(actual), "pattern": _describe(node.value)}
        ]
    if isinstance(node, ConditionValueExpression):
        ok, found = _match_keyword(node.value, fields)
        if not ok:
            return False, []
        (key, val), *_ = found.items()
        return True, [
            {"field": key, "value": _clip(val), "pattern": f"keyword {_describe(node.value)}"}
        ]
    raise SigmaEngineError(f"unsupported condition node: {type(node).__name__}")


def _clip(value: Any, limit: int = 300) -> Any:
    text = value if isinstance(value, str) else str(value)
    return text if len(text) <= limit else text[:limit] + "…"


# --- public evaluation API ------------------------------------------------------------------


def logsource_matches(rule_logsource: dict[str, str], event_logsource: dict[str, str]) -> bool:
    return all(event_logsource.get(k) == v for k, v in rule_logsource.items())


def match_event(rule: CompiledRule, event: EvalEvent) -> tuple[bool, list[dict[str, Any]]]:
    """Evaluate a single detection rule against one event."""
    if rule.is_correlation:
        raise SigmaEngineError("match_event does not accept correlation rules")
    if not logsource_matches(rule.logsource, event.logsource):
        return False, []
    return _evaluate(rule._tree, event.fields)


class SigmaEngine:
    def __init__(self, rules: Iterable[CompiledRule]):
        self.rules = list(rules)

    def evaluate(self, events: Sequence[EvalEvent]) -> list[Hit]:
        ordered = sorted(events, key=lambda e: e.timestamp)
        hits: list[Hit] = []
        for rule in self.rules:
            if rule.is_correlation:
                hits.extend(self._correlate(rule, ordered))
                continue
            for event in ordered:
                ok, trace = match_event(rule, event)
                if ok:
                    hits.append(Hit(rule=rule, events=[event], trace=trace))
        return hits

    # -- correlation ---------------------------------------------------------------------

    def _correlate(self, rule: CompiledRule, events: Sequence[EvalEvent]) -> list[Hit]:
        corr = rule.sigma
        assert isinstance(corr, SigmaCorrelationRule)
        window = timedelta(seconds=corr.timespan.seconds)
        group_by = [str(g) for g in (corr.group_by or [])]

        matched: dict[int, list[tuple[EvalEvent, list[dict[str, Any]]]]] = {}
        for idx, base in enumerate(rule.bases):
            matched[idx] = [(e, tr) for e in events for ok, tr in [match_event(base, e)] if ok]

        def group_key(e: EvalEvent) -> tuple[Any, ...]:
            return tuple(str(lookup(e.fields, g)) for g in group_by)

        if corr.type in (SigmaCorrelationType.EVENT_COUNT, SigmaCorrelationType.VALUE_COUNT):
            flat = [pair for pairs in matched.values() for pair in pairs]
            flat.sort(key=lambda p: p[0].timestamp)
            return self._count_windows(rule, corr, flat, group_key, group_by, window)

        if corr.type in (SigmaCorrelationType.TEMPORAL, SigmaCorrelationType.TEMPORAL_ORDERED):
            return self._temporal(rule, corr, matched, group_key, group_by, window)

        raise SigmaEngineError(f"{rule.slug}: correlation type {corr.type.name} is not supported")

    @staticmethod
    def _compare(op: Op, left: int, right: int) -> bool:
        return {
            Op.LT: left < right, Op.LTE: left <= right, Op.GT: left > right,
            Op.GTE: left >= right, Op.EQ: left == right, Op.NEQ: left != right,
        }[op]  # fmt: skip

    def _count_windows(
        self,
        rule: CompiledRule,
        corr: SigmaCorrelationRule,
        pairs: list[tuple[EvalEvent, list[dict[str, Any]]]],
        group_key: Any,
        group_by: list[str],
        window: timedelta,
    ) -> list[Hit]:
        by_group: dict[tuple[Any, ...], list[tuple[EvalEvent, list[dict[str, Any]]]]] = defaultdict(
            list
        )
        for pair in pairs:
            by_group[group_key(pair[0])].append(pair)

        condition = corr.condition
        if not isinstance(condition, SigmaCorrelationCondition):
            raise SigmaEngineError(
                f"{rule.slug}: extended correlation conditions are not supported"
            )
        is_value_count = corr.type == SigmaCorrelationType.VALUE_COUNT
        value_field = str(condition.fieldref) if condition.fieldref else None
        hits: list[Hit] = []
        for key, members in by_group.items():
            start = 0
            while start < len(members):
                end = start
                while (
                    end < len(members)
                    and members[end][0].timestamp - members[start][0].timestamp <= window
                ):
                    end += 1
                chunk = members[start:end]
                if is_value_count and value_field:
                    measure = len({str(lookup(e.fields, value_field)) for e, _ in chunk})
                else:
                    measure = len(chunk)
                if self._compare(condition.op, measure, condition.count):
                    hits.append(
                        Hit(
                            rule=rule,
                            events=[e for e, _ in chunk],
                            trace=chunk[-1][1],
                            group=dict(zip(group_by, key, strict=False)),
                            details={
                                "type": corr.type.name.lower(),
                                "measured": measure,
                                "threshold": f"{condition.op.name.lower()} {condition.count}",
                                "timespan_seconds": int(window.total_seconds()),
                            },
                        )
                    )
                    start = end  # non-overlapping windows: one alert per burst
                else:
                    start += 1
        return hits

    def _temporal(
        self,
        rule: CompiledRule,
        corr: SigmaCorrelationRule,
        matched: dict[int, list[tuple[EvalEvent, list[dict[str, Any]]]]],
        group_key: Any,
        group_by: list[str],
        window: timedelta,
    ) -> list[Hit]:
        ordered = corr.type == SigmaCorrelationType.TEMPORAL_ORDERED
        groups: dict[tuple[Any, ...], dict[int, list[tuple[EvalEvent, list[dict[str, Any]]]]]] = (
            defaultdict(dict)
        )
        for idx, pairs in matched.items():
            for pair in pairs:
                groups[group_key(pair[0])].setdefault(idx, []).append(pair)

        hits: list[Hit] = []
        for key, per_rule in groups.items():
            if len(per_rule) < len(rule.bases):
                continue
            firsts = [per_rule[i][0] for i in range(len(rule.bases))]
            lasts = [per_rule[i][-1] for i in range(len(rule.bases))]
            times = [p[0].timestamp for p in firsts]
            if ordered and times != sorted(times):
                continue
            span = max(p[0].timestamp for p in lasts) - min(times)
            if span > window:
                continue
            events = [p[0] for pairs in per_rule.values() for p in pairs]
            hits.append(
                Hit(
                    rule=rule,
                    events=events,
                    trace=[t for p in lasts for t in p[1]],
                    group=dict(zip(group_by, key, strict=False)),
                    details={
                        "type": corr.type.name.lower(),
                        "span_seconds": int(span.total_seconds()),
                    },
                )
            )
        return hits
