"""Runs Sigma rules over stored events and creates SOC alerts.

Alerts are aggregated: one alert per (rule, host[, correlation group]) per run or time bucket, with
every matching event attached as evidence. This keeps a 26-event DNS burst from becoming 26 alerts.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from cyberforge.models import Alert, DetectionRule, Event, MitreTechnique
from cyberforge.services.sigma_engine import (
    CompiledRule,
    EvalEvent,
    Hit,
    SigmaEngine,
    SigmaEngineError,
    compile_rule,
)
from cyberforge.services.sigma_service import technique_from_tag

log = logging.getLogger(__name__)

CONFIDENCE = {"critical": 90, "high": 80, "medium": 65, "low": 50, "informational": 40}

_compiled_cache: dict[int, tuple[object, CompiledRule]] = {}


def compiled_rules(session: Session) -> list[tuple[DetectionRule, CompiledRule]]:
    """Compile enabled Sigma rules, caching by (rule id, updated_at)."""
    rules = session.scalars(
        select(DetectionRule).where(
            DetectionRule.format == "sigma", DetectionRule.enabled.is_(True)
        )
    ).all()
    out: list[tuple[DetectionRule, CompiledRule]] = []
    for rule in rules:
        cached = _compiled_cache.get(rule.id)
        if cached and cached[0] == (rule.updated_at, len(rule.content)):
            out.append((rule, cached[1]))
            continue
        try:
            compiled = compile_rule(rule.slug, rule.content)
        except SigmaEngineError as exc:
            log.warning("skipping rule %s: %s", rule.slug, exc)
            continue
        _compiled_cache[rule.id] = ((rule.updated_at, len(rule.content)), compiled)
        out.append((rule, compiled))
    return out


def clear_cache() -> None:
    _compiled_cache.clear()


@dataclass
class _Group:
    rule: DetectionRule
    hits: list[Hit]


def _bucket(ts: datetime, seconds: int) -> int:
    return int(ts.timestamp()) // seconds


def run_detections(
    session: Session,
    events: Sequence[Event],
    *,
    lab_run_id: int | None = None,
    synthetic: bool = True,
    bucket_seconds: int = 900,
    only_rules: set[str] | None = None,
) -> list[Alert]:
    """Evaluate `events` against enabled Sigma rules and persist aggregated alerts."""
    if not events:
        return []
    pairs = compiled_rules(session)
    if only_rules is not None:
        pairs = [(r, c) for r, c in pairs if r.slug in only_rules]
    by_slug = {c.slug: (r, c) for r, c in pairs}
    engine = SigmaEngine(c for _, c in pairs)

    by_eval_id: dict[int | None, Event] = {e.id: e for e in events}
    evals = [EvalEvent(e.id, e.timestamp, e.fields, e.logsource) for e in events]
    hits = engine.evaluate(evals)
    if not hits:
        return []

    grouped: dict[tuple[str, str], _Group] = {}
    for hit in hits:
        rule, _ = by_slug[hit.rule.slug]
        host = next((by_eval_id[e.id].host for e in hit.events if by_eval_id[e.id].host), "")
        group = "|".join(f"{k}={v}" for k, v in (hit.group or {}).items())
        key = (rule.slug, f"{host}|{group}")
        grouped.setdefault(key, _Group(rule, [])).hits.append(hit)

    technique_cache: dict[str, MitreTechnique | None] = {}
    alerts: list[Alert] = []
    for (slug, scope), grp in grouped.items():
        first = min(grp.hits, key=lambda h: h.timestamp)
        ordered_events: dict[int | None, Event] = {}
        for hit in grp.hits:
            for ev in hit.events:
                if ev.id in by_eval_id:
                    ordered_events[ev.id] = by_eval_id[ev.id]
        rows = sorted(ordered_events.values(), key=lambda e: e.timestamp)
        anchor = rows[0]

        bucket = (
            f"run{lab_run_id}" if lab_run_id else f"b{_bucket(first.timestamp, bucket_seconds)}"
        )
        dedup = f"{slug}:{scope}:{bucket}"
        if session.scalar(select(Alert.id).where(Alert.dedup_key == dedup)):
            continue

        rule = grp.rule
        technique = _primary_technique(session, rule, technique_cache)
        level = rule.level if rule.level in CONFIDENCE else "medium"
        confidence = CONFIDENCE[level] + (5 if first.rule.is_correlation else 0)
        confidence = min(confidence + min(len(rows) // 10, 5), 98)

        trace = first.trace
        alert = Alert(
            title=rule.title,
            description=_describe(rule, len(rows), first),
            severity=level,
            status="new",
            source=anchor.source,
            timestamp=first.timestamp,
            host=anchor.host,
            user=next((e.user for e in rows if e.user), None),
            rule_id=rule.id,
            technique_id=technique.id if technique else None,
            tactic=technique.tactics[0].name if technique and technique.tactics else None,
            confidence=confidence,
            evidence={
                "match": trace,
                "correlation": first.details or None,
                "group": first.group,
                "event_count": len(rows),
                "rule": {
                    "slug": rule.slug,
                    "level": rule.level,
                    "correlation": first.rule.is_correlation,
                },
            },
            lab_run_id=lab_run_id,
            dedup_key=dedup,
            synthetic=synthetic,
        )
        alert.events = rows[:200]
        session.add(alert)
        alerts.append(alert)
    session.flush()
    return alerts


def _primary_technique(
    session: Session, rule: DetectionRule, cache: dict[str, MitreTechnique | None]
) -> MitreTechnique | None:
    """The first technique tag the rule author listed is the primary one."""
    candidates = [t for tag in rule.tags if (t := technique_from_tag(tag))]
    candidates += [t.id for t in rule.techniques if t.id not in candidates]
    for tech_id in candidates:
        if tech_id not in cache:
            cache[tech_id] = session.get(MitreTechnique, tech_id)
        if cache[tech_id] is not None:
            return cache[tech_id]
    return None


def _describe(rule: DetectionRule, event_count: int, hit: Hit) -> str:
    base = " ".join(rule.description.split())
    if hit.rule.is_correlation and hit.details:
        d = hit.details
        measured = d.get("measured")
        extra = (
            f" Correlation matched {measured} within {d.get('timespan_seconds')}s (threshold {d.get('threshold')})."
            if measured is not None
            else f" Correlated {event_count} events over {d.get('span_seconds', 0)}s."
        )
        return base + extra
    return base + (f" {event_count} matching events." if event_count > 1 else "")
