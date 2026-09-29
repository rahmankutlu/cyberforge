"""Story views: materialise a story's telemetry and evaluate detections against it.

The YAML declares which rules each step should trigger. This module actually runs the shipped
rules over the story's whole timeline (so correlation rules see earlier steps too) and reports what
fired where. `content.checks.check_stories` requires every declared rule to fire.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

from cyberforge.content.loader import ContentBundle, LoadedRule
from cyberforge.content.stories import StoryDoc
from cyberforge.services import sigma_explain, simulation
from cyberforge.services.sigma_engine import (
    CompiledRule,
    EvalEvent,
    SigmaEngine,
    SigmaEngineError,
    compile_rule,
    match_event,
)

STORY_DATE = date(2026, 3, 10)


@dataclass
class StepHits:
    """Rules that fired in one step, with the local indexes of the events involved."""

    rules: dict[str, list[int]] = field(default_factory=dict)


def step_start(time: str) -> datetime:
    hour, minute = (int(p) for p in time.split(":"))
    return datetime(STORY_DATE.year, STORY_DATE.month, STORY_DATE.day, hour, minute, tzinfo=UTC)


def compile_sigma(rules: list[LoadedRule]) -> dict[str, CompiledRule]:
    compiled: dict[str, CompiledRule] = {}
    for rule in rules:
        if rule.format != "sigma":
            continue
        try:
            compiled[rule.slug] = compile_rule(rule.slug, rule.content)
        except SigmaEngineError:
            continue
    return compiled


def evaluate(
    story: StoryDoc, compiled: dict[str, CompiledRule]
) -> tuple[list[list[dict[str, Any]]], list[StepHits]]:
    """(materialised events per step, rules fired per step) over the whole story timeline."""
    rows_per_step: list[list[dict[str, Any]]] = []
    flat: list[EvalEvent] = []
    owner: list[tuple[int, int]] = []  # global index -> (step index, local index)
    for si, step in enumerate(story.steps):
        rows = simulation.materialize(step.telemetry, step_start(step.time))
        rows_per_step.append(rows)
        for li, row in enumerate(rows):
            flat.append(EvalEvent(len(flat), row["timestamp"], row["fields"], row["logsource"]))
            owner.append((si, li))
    hits_per_step = [StepHits() for _ in story.steps]
    for hit in SigmaEngine(compiled.values()).evaluate(flat):
        # A hit belongs to the step of its latest event: that is when the alert would be raised.
        latest = max(hit.events, key=lambda e: (e.timestamp, e.id or 0))
        step_index, _ = owner[latest.id or 0]
        local = sorted(owner[e.id or 0][1] for e in hit.events if owner[e.id or 0][0] == step_index)
        hits_per_step[step_index].rules.setdefault(hit.rule.slug, []).extend(local)
    return rows_per_step, hits_per_step


def summary(story: StoryDoc) -> dict[str, Any]:
    events = sum(len(simulation.expand(s.telemetry)) for s in story.steps)
    return {
        "slug": story.slug,
        "title": story.title,
        "summary": story.summary,
        "difficulty": story.difficulty,
        "duration_minutes": story.duration_minutes,
        "domain": story.domain,
        "order": story.order,
        "tags": story.tags,
        "step_count": len(story.steps),
        "event_count": events,
        "techniques": sorted(story.techniques()),
        "detection_count": len(story.detection_slugs()),
        "start": step_start(story.steps[0].time).isoformat(),
        "end": (step_start(story.steps[-1].time) + timedelta(minutes=1)).isoformat(),
    }


def _detections(
    step_hits: StepHits,
    rows: list[dict[str, Any]],
    declared: list[str],
    rules: dict[str, LoadedRule],
    compiled: dict[str, CompiledRule],
) -> list[dict[str, Any]]:
    out = []
    for slug, local in sorted(step_hits.rules.items()):
        rule = rules[slug]
        why = None
        comp = compiled[slug]
        if not comp.is_correlation and local:
            row = rows[local[0]]
            ev = EvalEvent(local[0], row["timestamp"], row["fields"], row["logsource"])
            if match_event(comp, ev)[0]:
                exp = sigma_explain.explain_event(comp, ev)
                why = {"summary": exp.summary, "event": local[0]}
        out.append(
            {
                "slug": slug,
                "title": rule.title,
                "level": rule.level,
                "format": rule.format,
                "is_correlation": rule.is_correlation,
                "techniques": rule.technique_ids,
                "events": sorted(set(local)),
                "declared": slug in declared,
                "why": why,
            }
        )
    return out


def build_view(story: StoryDoc, bundle: ContentBundle) -> dict[str, Any]:
    rules = {r.slug: r for r in bundle.rules}
    names = {t["id"]: t["name"] for t in bundle.mitre_techniques}
    compiled = compile_sigma(bundle.rules)
    rows_per_step, hits = evaluate(story, compiled)

    steps: list[dict[str, Any]] = []
    for si, step in enumerate(story.steps):
        rows = rows_per_step[si]
        steps.append(
            {
                "id": step.id,
                "time": step.time,
                "timestamp": step_start(step.time).isoformat(),
                "title": step.title,
                "narrative": step.narrative,
                "events": [
                    {
                        "index": i,
                        "timestamp": row["timestamp"].isoformat(),
                        "source": row["source"],
                        "category": row["category"],
                        "host": row["host"],
                        "user": row["user"],
                        "message": row["message"],
                        "raw": row["raw"],
                        "note": row["note"],
                        "fields": row["fields"],
                    }
                    for i, row in enumerate(rows)
                ],
                "evidence": [e.model_dump() for e in step.evidence],
                "detections": _detections(hits[si], rows, step.detections, rules, compiled),
                "alert": step.alert.model_dump() if step.alert else None,
                "techniques": [{"id": t, "name": names.get(t)} for t in step.techniques],
                "questions": [q.model_dump() for q in step.questions],
                "decision": step.decision.model_dump() if step.decision else None,
                "graph": {
                    "nodes": [n.model_dump() for n in step.graph_nodes],
                    "edges": [e.model_dump() for e in step.graph_edges],
                },
            }
        )
    return {
        **summary(story),
        "briefing": story.briefing,
        "attack_chain": [
            {**c.model_dump(), "technique_name": names.get(c.technique)} for c in story.attack_chain
        ],
        "steps": steps,
        "containment": [c.model_dump() for c in story.containment],
        "postmortem": story.postmortem.model_dump(),
    }
