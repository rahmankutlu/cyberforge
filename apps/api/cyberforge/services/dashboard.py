"""Dashboard aggregation."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from cyberforge.config import Settings
from cyberforge.db import utcnow
from cyberforge.models import (
    Alert,
    DetectionRule,
    Event,
    Investigation,
    Lab,
    LabRun,
    MitreTactic,
    MitreTechnique,
)
from cyberforge.schemas.common import AnalystOut, TacticOut
from cyberforge.schemas.misc import CoverageSlice, DashboardResponse, Kpi, TimelinePoint
from cyberforge.schemas.soc import AlertSummary
from cyberforge.services import coverage as coverage_service

OPEN_STATUSES = ("new", "investigating")
HANDLED_STATUSES = ("contained", "resolved", "false_positive")
BUCKET_HOURS = 6
WINDOW_DAYS = 7

SYNTHETIC_NOTICE = (
    "All telemetry on this page is synthetic: seeded datasets and simulated lab runs. "
    "Nothing here comes from a real system or customer."
)


def _clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def build(session: Session, settings: Settings) -> DashboardResponse:
    now = utcnow()
    since = now - timedelta(days=WINDOW_DAYS)

    alert_total = session.scalar(select(func.count()).select_from(Alert)) or 0
    open_by_sev = dict(
        session.execute(
            select(Alert.severity, func.count())
            .where(Alert.status.in_(OPEN_STATUSES))
            .group_by(Alert.severity)
        ).all()
    )
    open_alerts = sum(open_by_sev.values())
    handled = (
        session.scalar(
            select(func.count()).select_from(Alert).where(Alert.status.in_(HANDLED_STATUSES))
        )
        or 0
    )

    rules_enabled = (
        session.scalar(
            select(func.count()).select_from(DetectionRule).where(DetectionRule.enabled.is_(True))
        )
        or 0
    )
    events_total = session.scalar(select(func.count()).select_from(Event)) or 0
    lab_total = session.scalar(select(func.count()).select_from(Lab)) or 0
    labs_run = session.scalar(select(func.count(func.distinct(LabRun.lab_id)))) or 0
    active_labs = (
        session.scalar(
            select(func.count(func.distinct(LabRun.lab_id))).where(LabRun.started_at >= since)
        )
        or 0
    )

    cov = coverage_service.compute(session)
    techniques = (
        session.scalars(select(MitreTechnique).options(joinedload(MitreTechnique.tactics)))
        .unique()
        .all()
    )
    attack_top = [t for t in techniques if t.framework == "attack" and not t.is_subtechnique]
    covered_top = [t for t in attack_top if cov[t.id].rules]
    coverage_pct = 100 * len(covered_top) / len(attack_top) if attack_top else 0
    covered_all = sum(1 for t in techniques if cov[t.id].rules)

    handled_pct = 100 * handled / alert_total if alert_total else 100
    pressure = (
        5 * open_by_sev.get("critical", 0)
        + 2 * open_by_sev.get("high", 0)
        + 0.5 * open_by_sev.get("medium", 0)
    )
    breakdown = {
        "detection_coverage": round(coverage_pct, 1),
        "alerts_handled": round(handled_pct, 1),
        "open_alert_pressure": round(_clamp(100 - pressure), 1),
    }
    posture = round(
        0.35 * breakdown["detection_coverage"]
        + 0.35 * breakdown["alerts_handled"]
        + 0.30 * breakdown["open_alert_pressure"]
    )

    kpis = [
        Kpi(
            key="posture",
            label="Security posture",
            value=posture,
            unit="/100",
            hint="Demo metric: coverage, handled alerts and open-alert pressure",
        ),
        Kpi(
            key="active_labs",
            label="Active labs",
            value=active_labs,
            hint=f"{labs_run} of {lab_total} labs run at least once",
        ),
        Kpi(
            key="open_alerts",
            label="Open alerts",
            value=open_alerts,
            hint=f"{open_by_sev.get('critical', 0)} critical, {open_by_sev.get('high', 0)} high",
        ),
        Kpi(
            key="rules",
            label="Detection rules",
            value=rules_enabled,
            hint="Sigma, YARA and Suricata",
        ),
        Kpi(
            key="techniques",
            label="MITRE techniques covered",
            value=covered_all,
            hint=f"{len(covered_top)} of {len(attack_top)} ATT&CK techniques have a rule",
        ),
        Kpi(key="events", label="Events processed", value=events_total, hint="Synthetic telemetry"),
    ]

    # timeline -------------------------------------------------------------------------------
    step = timedelta(hours=BUCKET_HOURS)
    first = since.replace(minute=0, second=0, microsecond=0)
    first -= timedelta(hours=first.hour % BUCKET_HOURS)

    def bucket_of(ts: datetime) -> datetime:
        return first + step * int((ts - first) / step)

    sev_counts: dict[datetime, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for ts, sev in session.execute(
        select(Alert.timestamp, Alert.severity).where(Alert.timestamp >= since)
    ):
        sev_counts[bucket_of(ts)][sev] += 1
    event_counts: dict[datetime, int] = defaultdict(int)
    for (ts,) in session.execute(select(Event.timestamp).where(Event.timestamp >= since)):
        event_counts[bucket_of(ts)] += 1
    timeline = []
    cursor = first
    while cursor <= now:
        c = sev_counts.get(cursor, {})
        timeline.append(
            TimelinePoint(
                bucket=cursor, critical=c.get("critical", 0), high=c.get("high", 0), medium=c.get("medium", 0),
                low=c.get("low", 0), informational=c.get("informational", 0), events=event_counts.get(cursor, 0),
            )
        )  # fmt: skip
        cursor += step

    recent_alerts = (
        session.scalars(
            select(Alert)
            .options(
                joinedload(Alert.rule), joinedload(Alert.technique), joinedload(Alert.assignee)
            )
            .order_by(Alert.timestamp.desc())
            .limit(8)
        )
        .unique()
        .all()
    )

    investigations = (
        session.scalars(
            select(Investigation)
            .options(joinedload(Investigation.lead))
            .order_by(Investigation.updated_at.desc())
            .limit(5)
        )
        .unique()
        .all()
    )

    slices = []
    tactics = session.scalars(
        select(MitreTactic).where(MitreTactic.framework == "attack").order_by(MitreTactic.position)
    ).all()
    by_tactic: dict[str, list[MitreTechnique]] = defaultdict(list)
    for tech in attack_top:
        for tactic in tech.tactics:
            by_tactic[tactic.id].append(tech)
    for tactic in tactics:
        members = by_tactic.get(tactic.id, [])
        slices.append(
            CoverageSlice(
                tactic=TacticOut.model_validate(tactic),
                covered=sum(1 for t in members if cov[t.id].rules),
                total=len(members),
            )
        )

    return DashboardResponse(
        generated_at=now,
        demo_mode=settings.demo_mode,
        synthetic_notice=SYNTHETIC_NOTICE,
        posture_score=int(_clamp(posture)),
        posture_breakdown=breakdown,
        kpis=kpis,
        timeline=timeline,
        recent_alerts=[AlertSummary.model_validate(a) for a in recent_alerts],
        recent_investigations=[
            {
                "id": i.id,
                "title": i.title,
                "status": i.status,
                "severity": i.severity,
                "lead": AnalystOut.model_validate(i.lead).model_dump() if i.lead else None,
                "updated_at": i.updated_at.isoformat(),
                "synthetic": i.synthetic,
            }
            for i in investigations
        ],
        lab_progress={"total": lab_total, "run": labs_run, "active": active_labs},
        coverage=slices,
    )
