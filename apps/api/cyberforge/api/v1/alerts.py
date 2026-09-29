"""SOC alerts."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import joinedload, selectinload

from cyberforge.api.deps import PageDep, SessionDep, escape_like
from cyberforge.models import (
    AIAnalysis,
    Alert,
    Analyst,
    Investigation,
    InvestigationNote,
    Lab,
    LabRun,
)
from cyberforge.schemas.common import EventOut, LabRef, Page, paginate
from cyberforge.schemas.soc import (
    AIAnalysisOut,
    AlertDetail,
    AlertPatch,
    AlertStats,
    AlertSummary,
    InvestigationRef,
    Lifecycle,
    NoteCreate,
    NoteOut,
)
from cyberforge.services import lifecycle

router = APIRouter(tags=["alerts"])

SEVERITY_ORDER = case(
    (Alert.severity == "critical", 0), (Alert.severity == "high", 1), (Alert.severity == "medium", 2),
    (Alert.severity == "low", 3), else_=4,
)  # fmt: skip
STATUS_ORDER = case(
    (Alert.status == "new", 0), (Alert.status == "investigating", 1), (Alert.status == "contained", 2),
    (Alert.status == "resolved", 3), else_=4,
)  # fmt: skip
SORTS: dict[str, Any] = {
    "timestamp": Alert.timestamp, "severity": SEVERITY_ORDER, "status": STATUS_ORDER, "title": Alert.title,
    "host": Alert.host, "confidence": Alert.confidence, "technique": Alert.technique_id,
}  # fmt: skip
_LOADS = (joinedload(Alert.rule), joinedload(Alert.technique), joinedload(Alert.assignee))


@router.get("/alerts", response_model=Page[AlertSummary], summary="List alerts")
def list_alerts(
    session: SessionDep,
    paging: PageDep,
    severity: Annotated[list[str] | None, Query(description="Repeat for multiple")] = None,
    status: Annotated[list[str] | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    technique: Annotated[
        str | None,
        Query(max_length=32, description="Technique id; a parent matches its sub-techniques"),
    ] = None,
    rule: Annotated[str | None, Query(max_length=128, description="Rule slug")] = None,
    host: Annotated[str | None, Query(max_length=128)] = None,
    assignee: Annotated[
        str | None, Query(max_length=32, description="Analyst id or 'unassigned'")
    ] = None,
    lab_run_id: int | None = None,
    investigation_id: int | None = None,
    sort: Annotated[
        str, Query(pattern="^(timestamp|severity|status|title|host|confidence|technique)$")
    ] = "timestamp",
    order: Literal["asc", "desc"] = "desc",
) -> dict[str, Any]:
    stmt = select(Alert)
    if severity:
        stmt = stmt.where(Alert.severity.in_(severity))
    if status:
        stmt = stmt.where(Alert.status.in_(status))
    if q:
        like = f"%{escape_like(q.lower())}%"
        stmt = stmt.where(
            or_(
                *[
                    func.lower(c).like(like, escape="\\")
                    for c in (Alert.title, Alert.host, Alert.user, Alert.description)
                ]
            )
        )
    if technique:
        stmt = stmt.where(
            or_(
                Alert.technique_id == technique,
                Alert.technique_id.like(f"{escape_like(technique)}.%", escape="\\"),
            )
        )
    if rule:
        from cyberforge.models import DetectionRule

        stmt = stmt.where(
            Alert.rule_id.in_(select(DetectionRule.id).where(DetectionRule.slug == rule))
        )
    if host:
        stmt = stmt.where(Alert.host == host)
    if assignee == "unassigned":
        stmt = stmt.where(Alert.assignee_id.is_(None))
    elif assignee and assignee.isdigit():
        stmt = stmt.where(Alert.assignee_id == int(assignee))
    if lab_run_id is not None:
        stmt = stmt.where(Alert.lab_run_id == lab_run_id)
    if investigation_id is not None:
        stmt = stmt.where(Alert.investigation_id == investigation_id)

    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    col = SORTS[sort]
    stmt = stmt.options(*_LOADS).order_by(
        col.asc() if order == "asc" else col.desc(), Alert.id.desc()
    )
    rows = session.scalars(stmt.offset(paging.offset).limit(paging.page_size)).unique().all()
    return paginate(
        [AlertSummary.model_validate(a) for a in rows], total, paging.page, paging.page_size
    )


@router.get("/alerts/stats", response_model=AlertStats, summary="Alert counts")
def alert_stats(session: SessionDep) -> AlertStats:
    by_sev = dict(
        session.execute(select(Alert.severity, func.count()).group_by(Alert.severity)).all()
    )
    by_status = dict(
        session.execute(select(Alert.status, func.count()).group_by(Alert.status)).all()
    )
    return AlertStats(
        total=sum(by_sev.values()), by_severity=by_sev, by_status=by_status,
        open=by_status.get("new", 0) + by_status.get("investigating", 0),
    )  # fmt: skip


def _load(session: SessionDep, alert_id: int) -> Alert:
    alert = session.scalar(
        select(Alert)
        .where(Alert.id == alert_id)
        .options(*_LOADS, selectinload(Alert.events), joinedload(Alert.investigation))
    )
    if alert is None:
        raise HTTPException(404, "Alert not found")
    return alert


def _notes(session: SessionDep, alert_id: int) -> list[NoteOut]:
    rows = session.scalars(
        select(InvestigationNote).where(InvestigationNote.alert_id == alert_id)
        .options(joinedload(InvestigationNote.author)).order_by(InvestigationNote.created_at)
    ).unique().all()  # fmt: skip
    return [NoteOut.model_validate(n) for n in rows]


def _detail(session: SessionDep, alert: Alert) -> AlertDetail:
    conds = []
    if alert.host:
        conds.append(Alert.host == alert.host)
    if alert.lab_run_id:
        conds.append(Alert.lab_run_id == alert.lab_run_id)
    related = (
        session.scalars(
            select(Alert).where(Alert.id != alert.id, or_(*conds)).options(*_LOADS)
            .order_by(Alert.timestamp.desc()).limit(6)
        ).unique().all()
        if conds
        else []
    )  # fmt: skip
    lab = None
    if alert.lab_run_id:
        run = session.get(LabRun, alert.lab_run_id)
        lab_obj = session.get(Lab, run.lab_id) if run else None
        lab = LabRef.model_validate(lab_obj) if lab_obj else None
    latest = session.scalar(
        select(AIAnalysis)
        .where(AIAnalysis.alert_id == alert.id)
        .order_by(AIAnalysis.created_at.desc())
        .limit(1)
    )
    summary = AlertSummary.model_validate(alert)
    return AlertDetail(
        **summary.model_dump(),
        description=alert.description,
        evidence=alert.evidence,
        events=[EventOut.model_validate(e) for e in alert.events],
        notes=_notes(session, alert.id),
        related_alerts=[AlertSummary.model_validate(a) for a in related],
        investigation=InvestigationRef.model_validate(alert.investigation)
        if alert.investigation
        else None,
        lab=lab,
        latest_ai_analysis=AIAnalysisOut.model_validate(latest) if latest else None,
        created_at=alert.created_at,
        updated_at=alert.updated_at,
    )


@router.get("/alerts/{alert_id}", response_model=AlertDetail, summary="Get an alert")
def get_alert(alert_id: int, session: SessionDep) -> AlertDetail:
    return _detail(session, _load(session, alert_id))


@router.patch(
    "/alerts/{alert_id}",
    response_model=AlertDetail,
    summary="Update status, assignee or investigation",
)
def patch_alert(alert_id: int, body: AlertPatch, session: SessionDep) -> AlertDetail:
    alert = _load(session, alert_id)
    if body.status is not None:
        alert.status = body.status
    if body.assignee_id is not None:
        if body.assignee_id == 0:
            alert.assignee_id = None
        elif session.get(Analyst, body.assignee_id) is None:
            raise HTTPException(422, "Unknown analyst")
        else:
            alert.assignee_id = body.assignee_id
    if body.investigation_id is not None:
        if body.investigation_id == 0:
            alert.investigation_id = None
        elif session.get(Investigation, body.investigation_id) is None:
            raise HTTPException(422, "Unknown investigation")
        else:
            alert.investigation_id = body.investigation_id
    session.flush()
    session.expire(alert)
    return _detail(session, _load(session, alert_id))


@router.post(
    "/alerts/{alert_id}/notes",
    response_model=NoteOut,
    status_code=201,
    summary="Add an analyst note",
)
def add_alert_note(alert_id: int, body: NoteCreate, session: SessionDep) -> NoteOut:
    alert = _load(session, alert_id)
    if body.author_id is not None and session.get(Analyst, body.author_id) is None:
        raise HTTPException(422, "Unknown analyst")
    note = InvestigationNote(
        alert_id=alert.id,
        investigation_id=alert.investigation_id,
        author_id=body.author_id,
        body=body.body.strip(),
    )
    session.add(note)
    session.flush()
    session.refresh(note)
    return NoteOut.model_validate(note)


@router.get(
    "/alerts/{alert_id}/lifecycle",
    response_model=Lifecycle,
    summary="Attack to detection lifecycle",
)
def alert_lifecycle(alert_id: int, session: SessionDep) -> Lifecycle:
    result = lifecycle.build(session, alert_id)
    if result is None:
        raise HTTPException(404, "Alert not found")
    return result
