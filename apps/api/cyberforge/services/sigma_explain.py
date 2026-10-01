"""Match traces: explain *why* a Sigma rule did or did not match an event.

The engine in `sigma_engine` answers "does it match?" as fast as possible and stops at the first
decisive branch. A learner (or a detection engineer debugging a rule) needs the opposite: every
selection evaluated, every field compared, and the condition walked step by step, including the
branches that failed. This module produces that trace from the same pySigma objects and the same
value-matching functions as the engine, so an explanation can never disagree with a real match.
`tests/test_sigma_explain.py` checks that agreement for every shipped rule.

Example of what a trace says about one event::

    selection_image      ✓  Image ends with "\\powershell.exe"
    selection_flag       ✓  CommandLine contains " -enc "
    filter_management    ✗  ParentImage ends with "\\CcmExec.exe"      (event: "C:\\Windows\\explorer.exe")
    condition            ✓  selection_image AND selection_flag AND NOT filter_management
    result               MATCHED
"""

from __future__ import annotations

from dataclasses import dataclass, field
from fnmatch import fnmatchcase
from typing import Any

from sigma.conditions import (
    ConditionAND,
    ConditionIdentifier,
    ConditionNOT,
    ConditionOR,
    ConditionSelector,
    ConditionValueExpression,
)
from sigma.correlations import SigmaCorrelationRule
from sigma.rule import SigmaDetection, SigmaDetectionItem, SigmaRule
from sigma.types import (
    SigmaString,
)

from cyberforge.services.sigma_engine import (
    CompiledRule,
    EvalEvent,
    SigmaEngine,
    SigmaEngineError,
    _clip,
    _describe,
    _match_field,
    _match_keyword,
    logsource_matches,
    lookup,
)

_OPERATORS = {
    "contains": "contains",
    "startswith": "starts with",
    "endswith": "ends with",
    "re": "matches regex",
    "cidr": "is in CIDR",
    "gt": ">",
    "gte": "≥",
    "lt": "<",
    "lte": "≤",
    "neq": "≠",
    "exists": "exists",
    "fieldref": "equals the value of",
    "base64": "equals (base64)",
    "base64offset": "contains (base64 offsets)",
    "windash": "equals (any dash style)",
    "wide": "equals (UTF-16)",
    "utf16le": "equals (UTF-16LE)",
    "utf16be": "equals (UTF-16BE)",
    "cased": "equals (case-sensitive)",
    "expand": "equals (placeholder)",
    "i": "matches regex",
    "m": "matches regex",
    "s": "matches regex",
}
_NOOP_MODIFIERS = {"all", "cased", "windash", "wide", "utf16le", "utf16be", "i", "m", "s"}


@dataclass
class ValueCheck:
    pattern: str  # the value as pySigma resolved it, wildcards included
    text: str  # the value as a person would say it
    matched: bool


@dataclass
class ItemTrace:
    """One `field|modifier: values` entry of a selection."""

    field: str | None  # None for keyword (field-less) items
    modifiers: list[str]
    operator: str
    linking: str  # "or" (any value) or "and" (|all)
    matched: bool
    actual: Any
    values: list[ValueCheck]

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "item",
            "field": self.field,
            "modifiers": self.modifiers,
            "operator": self.operator,
            "linking": self.linking,
            "matched": self.matched,
            "actual": self.actual,
            "values": [v.__dict__ for v in self.values],
        }


@dataclass
class SelectionTrace:
    name: str
    matched: bool
    linking: str  # how `children` combine: "and" | "or"
    children: list[Any] = field(default_factory=list)  # ItemTrace | SelectionTrace (nested map)

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": "selection" if self.name else "group",
            "name": self.name,
            "matched": self.matched,
            "linking": self.linking,
            "children": [c.to_dict() for c in self.children],
        }


# --- selections ---------------------------------------------------------------------------------


def _modifier_names(item: SigmaDetectionItem) -> list[str]:
    names = []
    for mod in item.modifiers:
        raw = mod.__name__.removeprefix("Sigma").removesuffix("Modifier").lower()
        names.append(raw)
    return names


_NEGATIVE = {
    "contains": "does not contain",
    "starts with": "does not start with",
    "ends with": "does not end with",
    "matches regex": "does not match",
    "is in CIDR": "is not in",
    "equals": "is not",
}


def _operator(names: list[str]) -> str:
    for name in names:
        if name in _OPERATORS and name not in _NOOP_MODIFIERS:
            return _OPERATORS[name]
    return "equals"


def _plain(value: Any, names: list[str]) -> str:
    """A value as a person reads it: `*\powershell.exe` under `endswith` is `\powershell.exe`."""
    text = _describe(value)
    if isinstance(value, SigmaString):
        if "contains" in names or "startswith" in names:
            text = text.removesuffix("*")
        if "contains" in names or "endswith" in names:
            text = text.removeprefix("*")
    return text


def _trace_item(item: SigmaDetectionItem, fields: dict[str, Any]) -> ItemTrace:
    names = _modifier_names(item)
    all_values = item.value_linking is ConditionAND
    checks: list[ValueCheck] = []
    actual: Any = None
    if item.field is None:
        for value in item.value:
            ok, _found = _match_keyword(value, fields)
            checks.append(ValueCheck(_describe(value), _plain(value, names), ok))
        actual = None
    else:
        actual = lookup(fields, item.field)
        for value in item.value:
            ok, _ = _match_field(value, item.field, fields)
            checks.append(ValueCheck(_describe(value), _plain(value, names), ok))
    matched = (
        all(c.matched for c in checks) if all_values else any(c.matched for c in checks)
    )
    if item.negated:
        matched = not matched
    return ItemTrace(
        field=item.field,
        modifiers=names,
        operator=_operator(names),
        linking="and" if all_values else "or",
        matched=matched,
        actual=_clip(actual) if actual is not None else None,
        values=checks,
    )


def _trace_detection(name: str, det: SigmaDetection, fields: dict[str, Any]) -> SelectionTrace:
    children: list[Any] = []
    for child in det.detection_items:
        if isinstance(child, SigmaDetection):
            children.append(_trace_detection("", child, fields))
        else:
            children.append(_trace_item(child, fields))
    linking = "and" if det.item_linking is ConditionAND else "or"
    outcomes = [c.matched for c in children]
    matched = all(outcomes) if linking == "and" else any(outcomes)
    return SelectionTrace(name=name, matched=matched, linking=linking, children=children)


# --- condition ----------------------------------------------------------------------------------


@dataclass
class ConditionNode:
    op: str  # and | or | not | selection | any_of | all_of
    label: str
    matched: bool
    children: list[ConditionNode] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "op": self.op,
            "label": self.label,
            "matched": self.matched,
            "children": [c.to_dict() for c in self.children],
        }


def _walk_condition(node: Any, results: dict[str, bool]) -> ConditionNode:
    if isinstance(node, ConditionIdentifier):
        name = node.identifier
        return ConditionNode("selection", name, results.get(name, False))
    if isinstance(node, ConditionSelector):
        quantifier, pattern = str(node.args[0]), str(node.args[1])
        names = [n for n in results if pattern == "them" or fnmatchcase(n, pattern)]
        kids = [ConditionNode("selection", n, results[n]) for n in names]
        every = quantifier.lower() == "all"
        matched = bool(kids) and (all(k.matched for k in kids) if every else any(k.matched for k in kids))
        label = f"{'all' if every else quantifier} of {pattern}"
        return ConditionNode("all_of" if every else "any_of", label, matched, kids)
    if isinstance(node, ConditionNOT):
        inner = _walk_condition(node.args[0], results)
        return ConditionNode("not", f"not {inner.label}", not inner.matched, [inner])
    if isinstance(node, (ConditionAND, ConditionOR)):
        kids = [_walk_condition(a, results) for a in node.args]
        is_and = isinstance(node, ConditionAND)
        word = " and " if is_and else " or "
        matched = all(k.matched for k in kids) if is_and else any(k.matched for k in kids)
        label = word.join(k.label if k.op in ("selection", "not", "any_of", "all_of") else f"({k.label})" for k in kids)
        return ConditionNode("and" if is_and else "or", label, matched, kids)
    if isinstance(node, ConditionValueExpression):
        return ConditionNode("selection", str(node.value), False)
    raise SigmaEngineError(f"unsupported condition node: {type(node).__name__}")


# --- public API ---------------------------------------------------------------------------------


@dataclass
class Explanation:
    matched: bool
    outcome: str  # matched | not_matched | logsource_mismatch
    summary: str
    logsource: dict[str, Any]
    selections: list[SelectionTrace]
    condition: ConditionNode | None
    condition_text: str
    hints: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "matched": self.matched,
            "outcome": self.outcome,
            "summary": self.summary,
            "logsource": self.logsource,
            "selections": [s.to_dict() for s in self.selections],
            "condition": self.condition.to_dict() if self.condition else None,
            "condition_text": self.condition_text,
            "hints": self.hints,
        }


def _item_reason(item: ItemTrace) -> str:
    subject = item.field or "no field"
    if item.field and item.actual is None:
        return f"{subject} is not present in the event"
    wanted = " or ".join(f'"{v.text}"' for v in item.values[:3])
    if len(item.values) > 3:
        wanted += f" (+{len(item.values) - 3} more)"
    negative = _NEGATIVE.get(item.operator, f"is not {item.operator}")
    every = "all of " if item.linking == "and" and len(item.values) > 1 else ""
    if item.field is None:
        return f"no field contained {every}{wanted}"
    return f'{subject} was "{item.actual}", which {negative} {every}{wanted}'


def _reason(sel: SelectionTrace) -> str:
    """One sentence on why a selection did not match."""
    failing = [c for c in sel.children if not c.matched]
    if not failing:
        return ""
    if sel.linking == "and":
        first = failing[0]
        return _item_reason(first) if isinstance(first, ItemTrace) else _reason(first)
    # `or`: every alternative failed; report the first two
    parts = [_item_reason(c) if isinstance(c, ItemTrace) else _reason(c) for c in failing[:2]]
    return "; and ".join(p for p in parts if p)


def _hints(rule: CompiledRule, sigma: SigmaRule, matched: bool, results: dict[str, bool]) -> list[str]:
    hints: list[str] = []
    filters = [n for n in results if n.startswith("filter")]
    for name in filters:
        if results[name] and not matched:
            hints.append(f"`{name}` is a known-benign exclusion and it applied to this event.")
    if matched:
        if filters:
            hints.append(
                "Exclusions in this rule: " + ", ".join(f"`{f}`" for f in filters) + ". None applied to this event."
            )
        for fp in sigma.falsepositives or []:
            hints.append(f"Possible false positive: {fp}")
        if not sigma.falsepositives:
            hints.append("This rule documents no false positives; check what benign software does this.")
    return hints


def explain_event(rule: CompiledRule, event: EvalEvent) -> Explanation:
    """Full trace of a (non-correlation) rule against one event."""
    if rule.is_correlation:
        raise SigmaEngineError("use explain_correlation for correlation rules")
    sigma = rule.sigma
    assert isinstance(sigma, SigmaRule)
    ls_ok = logsource_matches(rule.logsource, event.logsource)
    logsource = {"rule": rule.logsource, "event": event.logsource, "compatible": ls_ok}

    selections = [
        _trace_detection(name, det, event.fields) for name, det in sigma.detection.detections.items()
    ]
    results = {s.name: s.matched for s in selections}
    cond = sigma.detection.parsed_condition[0]
    raw = cond.parse(postprocess=False)
    tree = _walk_condition(raw if not isinstance(raw, tuple) else raw[0], results)
    matched = tree.matched and ls_ok

    if not ls_ok:
        wanted = ", ".join(f"{k}={v}" for k, v in rule.logsource.items())
        got = ", ".join(f"{k}={v}" for k, v in event.logsource.items()) or "none"
        return Explanation(
            False, "logsource_mismatch",
            f"The rule only looks at {wanted} events; this event is {got}, so no selection was evaluated for a match.",
            logsource, selections, tree, cond.condition, [],
        )  # fmt: skip

    if matched:
        used = [n for n, ok in results.items() if ok and not n.startswith("filter")]
        summary = f"Matched: {', '.join(used) or 'the condition'} matched and no exclusion applied."
        outcome = "matched"
    else:
        blockers = _blockers(tree, selections)
        summary = "Did not match: " + (blockers or "the condition evaluated to false.")
        outcome = "not_matched"
    return Explanation(
        matched, outcome, summary, logsource, selections, tree, cond.condition,
        _hints(rule, sigma, matched, results),
    )  # fmt: skip


def _blockers(tree: ConditionNode, selections: list[SelectionTrace]) -> str:
    """Name the selections that decided a non-match, with the reason for the first."""
    by_name = {s.name: s for s in selections}
    failing: list[str] = []
    excluded: list[str] = []

    def visit(node: ConditionNode, negated: bool = False) -> None:
        if node.op == "selection":
            if negated and node.matched is False:
                return
            (failing if not node.matched and not negated else excluded).append(node.label)
            return
        if node.op == "not":
            for k in node.children:
                if k.matched:  # inner matched => the NOT failed
                    excluded.append(k.label)
            return
        for k in node.children:
            if (node.op in ("and", "all_of") and not k.matched) or (node.op in ("or", "any_of") and not node.matched):
                visit(k, negated)

    visit(tree)
    parts = []
    if failing:
        first = by_name.get(failing[0])
        reason = _reason(first) if first else ""
        parts.append(f"`{failing[0]}` did not match" + (f" ({reason})" if reason else ""))
        if len(failing) > 1:
            parts.append(f"nor did {', '.join(f'`{n}`' for n in failing[1:])}")
    if excluded:
        parts.append(f"the exclusion {', '.join(f'`{n}`' for n in excluded)} applied")
    return "; ".join(parts)


def explain_correlation(rule: CompiledRule, events: list[EvalEvent]) -> dict[str, Any]:
    """Explain a correlation rule over a set of events: each hit, its window and its members."""
    corr = rule.sigma
    assert isinstance(corr, SigmaCorrelationRule)
    hits = SigmaEngine([rule]).evaluate(events)
    bases = []
    for base in rule.bases:
        matching = [
            e.id for e in events if logsource_matches(base.logsource, e.logsource)
            and explain_event(base, e).matched
        ]
        bases.append({"rule": base.slug.split(":")[-1], "title": base.title, "matching_events": matching})
    return {
        "type": corr.type.name.lower(),
        "timespan_seconds": int(corr.timespan.seconds),
        "group_by": [str(g) for g in (corr.group_by or [])],
        "base_rules": bases,
        "hits": [
            {
                "event_indexes": sorted(e.id or 0 for e in h.events),
                "group": h.group,
                "details": h.details,
                "first": min(e.timestamp for e in h.events).isoformat(),
                "last": max(e.timestamp for e in h.events).isoformat(),
            }
            for h in hits
        ],
    }
