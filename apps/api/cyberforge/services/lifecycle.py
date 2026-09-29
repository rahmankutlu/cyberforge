"""Builds the Attack -> Log -> Detection lifecycle for one alert.

Simulation -> raw event -> parsed event -> rule match -> SOC alert -> MITRE technique ->
investigation -> mitigation. Every stage is derived from stored data, nothing is invented here.
"""

from __future__ import annotations

from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from cyberforge.models import Alert, Lab, LabRun, MitreTechnique, lab_rules
from cyberforge.schemas.common import EventOut, LabRef, TacticOut, TechniqueRef
from cyberforge.schemas.soc import (
    AlertSummary,
    InvestigationRef,
    Lifecycle,
    LifecycleMatch,
    LifecycleMitigation,
    LifecycleMitre,
    LifecycleRule,
    LifecycleSimulation,
    MatchTrace,
    MitreMitigation,
    RawEvent,
)

STEPS_BY_SEVERITY = {
    "critical": "Treat as an active incident: contain the host or identity first, then investigate.",
    "high": "Prioritise now: confirm scope within the hour and prepare containment.",
    "medium": "Investigate during this shift; escalate if related alerts appear.",
    "low": "Review for context; close with a note or watch for related activity.",
    "informational": "Use as context for other alerts; no action needed on its own.",
}


def _explain(alert: Alert) -> str:
    ev = alert.evidence or {}
    corr = ev.get("correlation")
    matches = ev.get("match", [])
    if corr and corr.get("measured") is not None:
        return (
            f"A correlation rule counted {corr['measured']} within {corr.get('timespan_seconds')}s "
            f"(threshold {corr.get('threshold')}), grouped by {', '.join((ev.get('group') or {}).keys()) or 'event'}."
        )
    if corr:
        return f"A correlation rule matched an ordered sequence of events spanning {corr.get('span_seconds', 0)}s."
    if matches:
        fields = ", ".join(sorted({m["field"] for m in matches}))
        return f"The rule's selection matched on {fields}. Each matched value is highlighted below."
    return "The rule matched the events shown."


def build(session: Session, alert_id: int) -> Lifecycle | None:
    alert = session.scalar(
        select(Alert)
        .where(Alert.id == alert_id)
        .options(
            selectinload(Alert.events), selectinload(Alert.rule), selectinload(Alert.technique),
            selectinload(Alert.assignee), selectinload(Alert.investigation),
        )
    )  # fmt: skip
    if alert is None:
        return None
    ev = alert.evidence or {}

    # -- simulation
    lab: Lab | None = None
    run: LabRun | None = None
    if alert.lab_run_id:
        run = session.get(LabRun, alert.lab_run_id)
        lab = session.get(Lab, run.lab_id) if run else None
    if lab:
        doc = lab.document
        simulation = LifecycleSimulation(
            lab=LabRef.model_validate(lab), run_id=alert.lab_run_id,
            description=doc["attack_simulation"]["description"].strip(),
            narrative=[f"{s['title']}: {s['detail']}" for s in doc["attack_simulation"]["steps"]],
            synthetic=alert.synthetic,
        )  # fmt: skip
    else:
        dataset = next((e.dataset for e in alert.events if e.dataset), None)
        simulation = LifecycleSimulation(
            lab=None, run_id=None, synthetic=alert.synthetic,
            description=(
                f"Synthetic background dataset '{dataset}' evaluated by the detection engine."
                if dataset
                else "Live telemetry received from a lab container or imported source."
            ),
            narrative=[],
        )  # fmt: skip

    events = alert.events
    matched_ids = [e.id for e in events]
    raw_events = [
        RawEvent(id=e.id, timestamp=e.timestamp, source=e.source, raw=e.raw, note=e.note)
        for e in events
    ]

    # -- rule
    rule = alert.rule
    lifecycle_rule = (
        LifecycleRule(
            id=rule.id, slug=rule.slug, title=rule.title, level=rule.level, format=rule.format,
            description=" ".join(rule.description.split()), content=rule.content, logsource=rule.logsource,
            false_positives=rule.false_positives, is_correlation=rule.is_correlation,
        )
        if rule
        else None
    )  # fmt: skip

    # -- mitre
    tech: MitreTechnique | None = alert.technique
    others: list[TechniqueRef] = []
    if rule:
        others = [
            TechniqueRef.model_validate(t) for t in rule.techniques if not tech or t.id != tech.id
        ]
    mitre = LifecycleMitre(
        technique=TechniqueRef.model_validate(tech) if tech else None,
        description=tech.description if tech else "",
        url=tech.url if tech else "",
        tactics=[TacticOut.model_validate(t) for t in tech.tactics] if tech else [],
        other_techniques=others,
        mitigations=[MitreMitigation(**m) for m in (tech.mitigations if tech else [])],
    )

    # -- mitigation: prefer the lab's authored guidance, fall back to ATT&CK mitigations
    actions: list[str] = []
    source: Literal["lab", "mitre", "none"] = "none"
    if rule:
        lab_ids: list[int] = list(
            session.scalars(select(lab_rules.c.lab_id).where(lab_rules.c.rule_id == rule.id))
        )
        for lab_id in lab_ids:
            candidate = session.get(Lab, lab_id)
            if candidate:
                for item in candidate.document.get("mitigation", []):
                    if item not in actions:
                        actions.append(item)
        if actions:
            source = "lab"
    if not actions and tech and tech.mitigations:
        actions = [f"{m['name']}: {m['description']}" for m in tech.mitigations]
        source = "mitre"

    steps = [
        STEPS_BY_SEVERITY.get(alert.severity, STEPS_BY_SEVERITY["medium"]),
        "Read the raw event first, then confirm the parsed fields match it.",
        f"Pivot on host {alert.host or 'n/a'}" + (f" and user {alert.user}" if alert.user else "") + " for other activity in the same window.",
    ]  # fmt: skip
    if rule and rule.false_positives:
        steps.append("Rule out benign causes: " + "; ".join(rule.false_positives[:3]) + ".")
    steps.append("Record your decision and evidence in an analyst note before changing status.")

    inv = alert.investigation
    return Lifecycle(
        alert=AlertSummary.model_validate(alert),
        simulation=simulation,
        raw_events=raw_events,
        parsed_events=[EventOut.model_validate(e) for e in events],
        rule=lifecycle_rule,
        match=LifecycleMatch(
            trace=[MatchTrace(**m) for m in ev.get("match", [])],
            correlation=ev.get("correlation"),
            group=ev.get("group"),
            explanation=_explain(alert),
            matched_event_ids=matched_ids,
        ),
        mitre=mitre,
        investigation=InvestigationRef.model_validate(inv) if inv else None,
        mitigation=LifecycleMitigation(source=source, actions=actions, analyst_steps=steps),
    )
