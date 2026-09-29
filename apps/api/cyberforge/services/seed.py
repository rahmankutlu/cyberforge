"""Database seeding.

`sync_reference` is idempotent and safe to run on every start: it upserts labs, rules, MITRE data,
analysts, indicators and learning content from the repository files, leaving user-created rules
and all SOC activity untouched.

`seed_demo` generates synthetic activity (lab runs, background datasets, investigations) so a fresh
install is populated. It runs once, when the database has no alerts yet, and only in demo mode.
"""

from __future__ import annotations

import logging
import zlib
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from cyberforge.content.loader import ContentBundle, LoadedRule
from cyberforge.db import utcnow
from cyberforge.models import (
    Alert,
    Analyst,
    DetectionRule,
    Event,
    IncidentReport,
    Indicator,
    Investigation,
    InvestigationNote,
    Lab,
    LabRun,
    LearningModule,
    MitreTactic,
    MitreTechnique,
    TimelineEntry,
)
from cyberforge.services import detection_engine, simulation
from cyberforge.services.labs import run_lab

log = logging.getLogger(__name__)

STATUS_CYCLE = ["new", "new", "investigating", "resolved", "false_positive", "new", "contained"]


def _stable(text: str) -> int:
    return zlib.crc32(text.encode())


# --- reference data -------------------------------------------------------------------------


def sync_reference(session: Session, bundle: ContentBundle) -> None:
    _sync_mitre(session, bundle)
    _sync_rules(session, bundle)
    _sync_labs(session, bundle)
    _sync_analysts(session, bundle)
    _sync_indicators(session, bundle)
    _sync_learning(session, bundle)
    detection_engine.clear_cache()
    session.flush()


def _sync_mitre(session: Session, bundle: ContentBundle) -> None:
    tactics = {t.id: t for t in session.scalars(select(MitreTactic))}
    for position, raw in enumerate(bundle.mitre_tactics):
        tactic = tactics.get(raw["id"]) or MitreTactic(id=raw["id"])
        tactic.framework = raw["framework"]
        tactic.shortname = raw["shortname"]
        tactic.name = raw["name"]
        tactic.description = raw.get("description", "")
        tactic.url = raw.get("url", "")
        tactic.position = position
        session.add(tactic)
        tactics[tactic.id] = tactic
    session.flush()

    techniques = {t.id: t for t in session.scalars(select(MitreTechnique))}
    for raw in bundle.mitre_techniques:
        tech = techniques.get(raw["id"]) or MitreTechnique(id=raw["id"])
        tech.framework = raw["framework"]
        tech.name = raw["name"]
        tech.description = raw.get("description", "")
        tech.url = raw.get("url", "")
        tech.is_subtechnique = raw.get("is_subtechnique", False)
        tech.platforms = raw.get("platforms", [])
        tech.mitigations = raw.get("mitigations", [])
        tech.parent_id = None
        session.add(tech)
        techniques[tech.id] = tech
    session.flush()
    for raw in bundle.mitre_techniques:
        tech = techniques[raw["id"]]
        tech.parent_id = raw.get("parent")
        tech.tactics = [tactics[t] for t in raw.get("tactics", []) if t in tactics]
    session.flush()


def _sync_rules(session: Session, bundle: ContentBundle) -> None:
    existing = {r.slug: r for r in session.scalars(select(DetectionRule))}
    seen: set[str] = set()
    techniques = {t.id: t for t in session.scalars(select(MitreTechnique))}
    for loaded in bundle.rules:
        seen.add(loaded.slug)
        rule = existing.get(loaded.slug)
        if rule is not None and rule.origin == "user":
            continue  # never overwrite a user's rule that shadows a builtin slug
        if rule is None:
            rule = DetectionRule(slug=loaded.slug, origin="builtin")
            session.add(rule)
        _apply_rule(rule, loaded, techniques)
    for slug, rule in existing.items():
        if rule.origin == "builtin" and slug not in seen:
            session.delete(rule)
    session.flush()


def _apply_rule(
    rule: DetectionRule, loaded: LoadedRule, techniques: dict[str, MitreTechnique]
) -> None:
    rule.title = loaded.title
    rule.format = loaded.format
    rule.status = loaded.status
    rule.level = loaded.level
    rule.description = loaded.description
    rule.content = loaded.content
    rule.logsource = loaded.logsource
    rule.tags = loaded.tags
    rule.false_positives = loaded.false_positives
    rule.references = loaded.references
    rule.author = loaded.author
    rule.is_correlation = loaded.is_correlation
    rule.source_path = loaded.path
    rule.techniques = [techniques[t] for t in loaded.technique_ids if t in techniques]


def _sync_labs(session: Session, bundle: ContentBundle) -> None:
    existing = {lab.slug: lab for lab in session.scalars(select(Lab))}
    techniques = {t.id: t for t in session.scalars(select(MitreTechnique))}
    rules = {r.slug: r for r in session.scalars(select(DetectionRule))}
    seen: set[str] = set()
    for loaded in bundle.labs:
        doc = loaded.doc
        seen.add(doc.slug)
        lab = existing.get(doc.slug)
        if lab is None:
            lab = Lab(slug=doc.slug)
            session.add(lab)
        lab.number = doc.number
        lab.title = doc.title
        lab.difficulty = doc.difficulty
        lab.category = doc.category
        lab.domain = doc.domain
        lab.duration_minutes = doc.duration_minutes
        lab.summary = doc.summary
        lab.document = doc.model_dump(mode="json")
        lab.scenario_events = [e.model_dump(mode="json") for e in loaded.scenario]
        lab.source_path = loaded.path.relative_to(bundle.root).as_posix()
        lab.techniques = [techniques[t] for t in doc.mitre if t in techniques]
        lab.rules = [rules[s] for s in doc.expected_detection.rules if s in rules]
    for slug, lab in existing.items():
        if slug not in seen:
            session.delete(lab)
    session.flush()


def _sync_analysts(session: Session, bundle: ContentBundle) -> None:
    existing = {a.handle: a for a in session.scalars(select(Analyst))}
    for doc in bundle.analysts:
        analyst = existing.get(doc.handle) or Analyst(handle=doc.handle)
        analyst.name = doc.name
        analyst.role = doc.role
        session.add(analyst)


def _sync_indicators(session: Session, bundle: ContentBundle) -> None:
    existing = {(i.type, i.value): i for i in session.scalars(select(Indicator))}
    now = utcnow()
    for doc in bundle.indicators:
        ind = existing.get((doc.type, doc.value))
        if ind is not None and not ind.synthetic:
            continue  # manually imported indicator with the same key wins
        ind = ind or Indicator(type=doc.type, value=doc.value)
        ind.tags = doc.tags
        ind.confidence = doc.confidence
        ind.source = doc.source
        ind.tlp = doc.tlp
        ind.first_seen = now - timedelta(days=doc.first_seen_days_ago)
        ind.last_seen = now - timedelta(days=doc.last_seen_days_ago)
        ind.notes = doc.notes
        ind.synthetic = True
        session.add(ind)


def _sync_learning(session: Session, bundle: ContentBundle) -> None:
    existing = {m.slug: m for m in session.scalars(select(LearningModule))}
    seen: set[str] = set()

    def upsert(slug: str, **values: object) -> None:
        seen.add(slug)
        module = existing.get(slug) or LearningModule(slug=slug)
        for key, value in values.items():
            setattr(module, key, value)
        session.add(module)

    for track in bundle.tracks:
        for position, mod in enumerate(track.modules, start=1):
            upsert(
                mod.slug, track=track.slug, position=position, title=mod.title, summary=mod.summary,
                body=mod.body, duration_minutes=mod.duration_minutes, day=None, lab_slugs=mod.labs,
                rule_slugs=mod.rules, technique_ids=mod.techniques,
            )  # fmt: skip
    if bundle.thirty_days:
        for day in bundle.thirty_days.days:
            body = (
                "## Today\n\n"
                + day.summary
                + "\n\n### Tasks\n\n"
                + "\n".join(f"- {t}" for t in day.tasks)
            )
            if day.reading:
                body += "\n\n### Reading\n\n" + "\n".join(
                    f"- [{r.title}]({r.url})" for r in day.reading
                )
            upsert(
                f"day-{day.day:02d}", track="30-days", position=day.day, title=day.title,
                summary=day.summary, body=body, duration_minutes=45, day=day.day, lab_slugs=day.labs,
                rule_slugs=day.rules, technique_ids=day.techniques,
            )  # fmt: skip
    for slug, module in existing.items():
        if slug not in seen:
            session.delete(module)


# --- demo data ---------------------------------------------------------------------------------


def needs_demo_seed(session: Session) -> bool:
    return (session.scalar(select(func.count()).select_from(Alert)) or 0) == 0


def seed_demo(session: Session, bundle: ContentBundle) -> None:
    now = utcnow()
    labs = {lab.slug: lab for lab in session.scalars(select(Lab))}
    incidents_by_lab = {inc.lab: inc for inc in bundle.incidents}

    # 1. Replay every lab at a stable, staggered point in the past.
    runs: dict[str, tuple] = {}
    for loaded in sorted(bundle.labs, key=lambda x: x.doc.number):
        slug = loaded.doc.slug
        incident = incidents_by_lab.get(slug)
        days_ago = incident.days_ago if incident else _stable(slug) % 7
        end = now - timedelta(
            days=days_ago, hours=_stable(slug + "h") % 20, minutes=_stable(slug + "m") % 50
        )
        run = run_lab(session, labs[slug], end_at=end, notes="Seeded demo run (synthetic).")
        runs[slug] = (run, end)

    # 2. Background datasets, evaluated by the same engine.
    _seed_datasets(session, bundle, now)

    # 3. Distribute alert statuses / assignees for non-incident alerts.
    analysts = list(session.scalars(select(Analyst).order_by(Analyst.id)))
    incident_run_ids = {runs[i.lab][0].id for i in bundle.incidents}
    alerts = list(session.scalars(select(Alert).order_by(Alert.id)))
    for alert in alerts:
        if alert.lab_run_id in incident_run_ids:
            continue
        pick = _stable(f"{alert.dedup_key}") % len(STATUS_CYCLE)
        alert.status = STATUS_CYCLE[pick]
        if alert.status != "new" and analysts:
            alert.assignee_id = analysts[pick % len(analysts)].id

    # 4. Investigations for the synthetic incidents.
    _seed_investigations(session, bundle, runs, {a.handle: a for a in analysts})
    session.flush()


def _seed_datasets(session: Session, bundle: ContentBundle, now) -> None:
    window = timedelta(hours=48)
    names = sorted(bundle.datasets)
    for name in names:
        scenario = bundle.datasets[name]
        start = now - window
        rows = simulation.materialize(scenario, start)
        events = [Event(**row, synthetic=True, dataset=name) for row in rows]
        session.add_all(events)
        session.flush()
        detection_engine.run_detections(session, events, synthetic=True, bucket_seconds=86400)


def _seed_investigations(session, bundle, runs, analysts) -> None:
    for inc in bundle.incidents:
        run, _ = runs[inc.lab]
        alerts = list(
            session.scalars(
                select(Alert).where(Alert.lab_run_id == run.id).order_by(Alert.timestamp)
            )
        )
        if not alerts:
            continue
        anchor = min(a.timestamp for a in alerts)
        lead = analysts.get(inc.lead)
        investigation = Investigation(
            title=inc.title, summary=inc.summary, status=inc.status, severity=inc.severity,
            lead_id=lead.id if lead else None, lab_slug=inc.lab, created_at=anchor + timedelta(minutes=4),
            synthetic=True,
        )  # fmt: skip
        session.add(investigation)
        session.flush()
        for alert in alerts:
            alert.investigation_id = investigation.id
            alert.status = inc.alert_status
            alert.assignee_id = lead.id if lead else None
        for entry in inc.timeline:
            session.add(
                TimelineEntry(
                    investigation_id=investigation.id, timestamp=anchor + timedelta(minutes=entry.offset_minutes),
                    kind=entry.kind, title=entry.title, detail=entry.detail,
                )
            )  # fmt: skip
        for note in inc.notes:
            author = analysts.get(note.analyst)
            session.add(
                InvestigationNote(
                    investigation_id=investigation.id, author_id=author.id if author else None,
                    body=note.body, created_at=anchor + timedelta(minutes=note.offset_minutes),
                )
            )  # fmt: skip
        if inc.report:
            techniques = sorted({a.technique_id for a in alerts if a.technique_id})
            session.add(
                IncidentReport(
                    investigation_id=investigation.id,
                    status="final" if inc.status == "closed" else "draft",
                    executive_summary=inc.report.executive_summary,
                    timeline=[
                        {"time": (anchor + timedelta(minutes=e.offset_minutes)).isoformat(), "event": e.title}
                        for e in inc.timeline
                    ],
                    affected_assets=inc.report.affected_assets,
                    indicators=inc.report.indicators,
                    mitre_techniques=techniques,
                    evidence=inc.report.evidence,
                    root_cause=inc.report.root_cause,
                    containment=inc.report.containment,
                    remediation=inc.report.remediation,
                    lessons_learned=inc.report.lessons_learned,
                )
            )  # fmt: skip


def reset_demo(session: Session) -> None:
    """Remove all synthetic SOC activity (keeps reference content and user rules)."""
    for model in (TimelineEntry, InvestigationNote, IncidentReport):
        session.execute(delete(model))
    session.execute(delete(Alert))
    session.execute(delete(Investigation))
    session.execute(delete(Event))
    session.execute(delete(LabRun))
    session.flush()
