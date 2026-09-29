"""Investigations, analyst notes, timeline and incident reports."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload, selectinload

from cyberforge.api.deps import PageDep, SessionDep, escape_like
from cyberforge.db import utcnow
from cyberforge.models import (
    Alert,
    Analyst,
    IncidentReport,
    Investigation,
    InvestigationNote,
    MitreTechnique,
    TimelineEntry,
)
from cyberforge.schemas.common import Page, TechniqueRef, paginate
from cyberforge.schemas.soc import (
    AlertLink,
    AlertSummary,
    InvestigationCreate,
    InvestigationDetail,
    InvestigationPatch,
    InvestigationSummary,
    NoteCreate,
    NoteOut,
    ReportOut,
    ReportUpdate,
    TimelineCreate,
    TimelineOut,
)
from cyberforge.services import reports

router = APIRouter(tags=["investigations"])
_ALERT_LOADS = (joinedload(Alert.rule), joinedload(Alert.technique), joinedload(Alert.assignee))


def _summary(inv: Investigation, alert_count: int, note_count: int) -> InvestigationSummary:
    return InvestigationSummary(
        id=inv.id, title=inv.title, summary=inv.summary, status=inv.status, severity=inv.severity, lead=inv.lead,
        lab_slug=inv.lab_slug, created_at=inv.created_at, updated_at=inv.updated_at, synthetic=inv.synthetic,
        alert_count=alert_count, note_count=note_count,
    )  # fmt: skip


def _get(session: SessionDep, inv_id: int) -> Investigation:
    inv = session.scalar(
        select(Investigation).where(Investigation.id == inv_id).options(
            joinedload(Investigation.lead), selectinload(Investigation.notes).joinedload(InvestigationNote.author),
            selectinload(Investigation.timeline), joinedload(Investigation.report),
        )
    )  # fmt: skip
    if inv is None:
        raise HTTPException(404, "Investigation not found")
    return inv


def _detail(session: SessionDep, inv: Investigation) -> InvestigationDetail:
    alerts = (
        session.scalars(
            select(Alert)
            .where(Alert.investigation_id == inv.id)
            .options(*_ALERT_LOADS)
            .order_by(Alert.timestamp)
        )
        .unique()
        .all()
    )
    techniques = {a.technique_id: a.technique for a in alerts if a.technique}
    base = _summary(inv, len(alerts), len(inv.notes))
    return InvestigationDetail(
        **base.model_dump(),
        alerts=[AlertSummary.model_validate(a) for a in alerts],
        notes=[NoteOut.model_validate(n) for n in inv.notes],
        timeline=[TimelineOut.model_validate(t) for t in inv.timeline],
        report=ReportOut.model_validate(inv.report) if inv.report else None,
        techniques=[TechniqueRef.model_validate(t) for t in techniques.values()],
    )


@router.get(
    "/investigations", response_model=Page[InvestigationSummary], summary="List investigations"
)
def list_investigations(
    session: SessionDep,
    paging: PageDep,
    status: Annotated[list[str] | None, Query()] = None,
    severity: Annotated[list[str] | None, Query()] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    sort: Annotated[
        str, Query(pattern="^(updated_at|created_at|title|severity|status)$")
    ] = "updated_at",
    order: Literal["asc", "desc"] = "desc",
) -> dict[str, Any]:
    stmt = select(Investigation)
    if status:
        stmt = stmt.where(Investigation.status.in_(status))
    if severity:
        stmt = stmt.where(Investigation.severity.in_(severity))
    if q:
        stmt = stmt.where(
            func.lower(Investigation.title).like(f"%{escape_like(q.lower())}%", escape="\\")
        )
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    col = getattr(Investigation, sort)
    rows = session.scalars(
        stmt.options(joinedload(Investigation.lead)).order_by(col.asc() if order == "asc" else col.desc())
        .offset(paging.offset).limit(paging.page_size)
    ).unique().all()  # fmt: skip
    ids = [r.id for r in rows]
    alert_counts = dict(
        session.execute(
            select(Alert.investigation_id, func.count())
            .where(Alert.investigation_id.in_(ids))
            .group_by(Alert.investigation_id)
        ).all()
    )
    note_counts = dict(
        session.execute(
            select(InvestigationNote.investigation_id, func.count())
            .where(InvestigationNote.investigation_id.in_(ids))
            .group_by(InvestigationNote.investigation_id)
        ).all()
    )
    return paginate(
        [_summary(r, alert_counts.get(r.id, 0), note_counts.get(r.id, 0)) for r in rows],
        total,
        paging.page,
        paging.page_size,
    )


@router.post(
    "/investigations",
    response_model=InvestigationDetail,
    status_code=201,
    summary="Create an investigation",
)
def create_investigation(body: InvestigationCreate, session: SessionDep) -> InvestigationDetail:
    if body.lead_id is not None and session.get(Analyst, body.lead_id) is None:
        raise HTTPException(422, "Unknown analyst")
    alerts = (
        list(session.scalars(select(Alert).where(Alert.id.in_(body.alert_ids))))
        if body.alert_ids
        else []
    )
    if len(alerts) != len(set(body.alert_ids)):
        raise HTTPException(422, "One or more alerts do not exist")
    inv = Investigation(
        title=body.title.strip(),
        summary=body.summary,
        severity=body.severity,
        lead_id=body.lead_id,
        synthetic=False,
        status="open",
    )
    session.add(inv)
    session.flush()
    for alert in alerts:
        alert.investigation_id = inv.id
        if alert.status == "new":
            alert.status = "investigating"
        session.add(
            TimelineEntry(
                investigation_id=inv.id,
                timestamp=alert.timestamp,
                kind="detection",
                title=alert.title,
                detail=f"Alert #{alert.id} on {alert.host or 'n/a'}",
                alert_id=alert.id,
            )
        )
    session.add(
        TimelineEntry(
            investigation_id=inv.id, timestamp=utcnow(), kind="status", title="Investigation opened"
        )
    )
    session.flush()
    return _detail(session, _get(session, inv.id))


@router.get(
    "/investigations/{inv_id}", response_model=InvestigationDetail, summary="Get an investigation"
)
def get_investigation(inv_id: int, session: SessionDep) -> InvestigationDetail:
    return _detail(session, _get(session, inv_id))


@router.patch(
    "/investigations/{inv_id}",
    response_model=InvestigationDetail,
    summary="Update an investigation",
)
def patch_investigation(
    inv_id: int, body: InvestigationPatch, session: SessionDep
) -> InvestigationDetail:
    inv = _get(session, inv_id)
    if body.title is not None:
        inv.title = body.title.strip()
    if body.summary is not None:
        inv.summary = body.summary
    if body.severity is not None:
        inv.severity = body.severity
    if body.lead_id is not None:
        if body.lead_id and session.get(Analyst, body.lead_id) is None:
            raise HTTPException(422, "Unknown analyst")
        inv.lead_id = body.lead_id or None
    if body.status is not None and body.status != inv.status:
        session.add(
            TimelineEntry(
                investigation_id=inv.id,
                timestamp=utcnow(),
                kind="status",
                title=f"Status changed to {body.status}",
                detail=f"Was {inv.status}.",
            )
        )
        inv.status = body.status
    inv.updated_at = utcnow()
    session.flush()
    session.expire(inv)
    return _detail(session, _get(session, inv_id))


@router.post(
    "/investigations/{inv_id}/alerts", response_model=InvestigationDetail, summary="Attach alerts"
)
def attach_alerts(inv_id: int, body: AlertLink, session: SessionDep) -> InvestigationDetail:
    inv = _get(session, inv_id)
    alerts = list(session.scalars(select(Alert).where(Alert.id.in_(body.alert_ids))))
    if len(alerts) != len(set(body.alert_ids)):
        raise HTTPException(422, "One or more alerts do not exist")
    for alert in alerts:
        alert.investigation_id = inv.id
        session.add(
            TimelineEntry(
                investigation_id=inv.id,
                timestamp=utcnow(),
                kind="evidence",
                title=f"Alert #{alert.id} attached",
                detail=alert.title,
                alert_id=alert.id,
            )
        )
    inv.updated_at = utcnow()
    session.flush()
    session.expire(inv)
    return _detail(session, _get(session, inv_id))


@router.post(
    "/investigations/{inv_id}/notes",
    response_model=NoteOut,
    status_code=201,
    summary="Add an analyst note",
)
def add_note(inv_id: int, body: NoteCreate, session: SessionDep) -> NoteOut:
    inv = _get(session, inv_id)
    if body.author_id is not None and session.get(Analyst, body.author_id) is None:
        raise HTTPException(422, "Unknown analyst")
    note = InvestigationNote(
        investigation_id=inv.id, author_id=body.author_id, body=body.body.strip()
    )
    session.add(note)
    inv.updated_at = utcnow()
    session.flush()
    session.refresh(note)
    return NoteOut.model_validate(note)


@router.post(
    "/investigations/{inv_id}/timeline",
    response_model=TimelineOut,
    status_code=201,
    summary="Add a timeline entry",
)
def add_timeline(inv_id: int, body: TimelineCreate, session: SessionDep) -> TimelineOut:
    inv = _get(session, inv_id)
    if body.timestamp is not None and body.timestamp.tzinfo is None:
        raise HTTPException(422, "timestamp must be timezone-aware")
    entry = TimelineEntry(
        investigation_id=inv.id,
        timestamp=body.timestamp or utcnow(),
        kind=body.kind,
        title=body.title,
        detail=body.detail,
        alert_id=body.alert_id,
    )
    session.add(entry)
    inv.updated_at = utcnow()
    session.flush()
    return TimelineOut.model_validate(entry)


# --- report -------------------------------------------------------------------------------------


def _ensure_report(session: SessionDep, inv: Investigation) -> IncidentReport:
    if inv.report is None:
        techniques = sorted({a.technique_id for a in inv.alerts if a.technique_id})
        inv.report = IncidentReport(
            investigation_id=inv.id, executive_summary=inv.summary, mitre_techniques=techniques,
            affected_assets=sorted({a.host for a in inv.alerts if a.host}),
            timeline=[{"time": t.timestamp.isoformat(), "event": t.title} for t in inv.timeline],
        )  # fmt: skip
        session.flush()
    return inv.report


@router.get(
    "/investigations/{inv_id}/report",
    response_model=ReportOut,
    summary="Get (or draft) the incident report",
)
def get_report(inv_id: int, session: SessionDep) -> IncidentReport:
    inv = _get(session, inv_id)
    inv_alerts = session.scalars(select(Alert).where(Alert.investigation_id == inv.id)).all()
    inv.alerts = list(inv_alerts)
    return _ensure_report(session, inv)


@router.put(
    "/investigations/{inv_id}/report", response_model=ReportOut, summary="Save the incident report"
)
def put_report(inv_id: int, body: ReportUpdate, session: SessionDep) -> IncidentReport:
    inv = _get(session, inv_id)
    inv.alerts = list(session.scalars(select(Alert).where(Alert.investigation_id == inv.id)))
    report = _ensure_report(session, inv)
    known = set(
        session.scalars(
            select(MitreTechnique.id).where(MitreTechnique.id.in_(body.mitre_techniques))
        )
    )
    unknown = [t for t in body.mitre_techniques if t not in known]
    if unknown:
        raise HTTPException(422, f"Unknown MITRE identifier(s): {', '.join(unknown)}")
    for key, value in body.model_dump().items():
        setattr(report, key, value)
    inv.updated_at = utcnow()
    session.flush()
    return report


@router.get(
    "/investigations/{inv_id}/report/export", summary="Export the report as Markdown or JSON"
)
def export_report(
    inv_id: int,
    session: SessionDep,
    format: Annotated[Literal["markdown", "json"], Query()] = "markdown",
):
    inv = _get(session, inv_id)
    inv.alerts = list(session.scalars(select(Alert).where(Alert.investigation_id == inv.id)))
    report = _ensure_report(session, inv)
    if format == "json":
        return reports.report_dict(inv, report)
    return PlainTextResponse(
        reports.to_markdown(inv, report),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="incident-{inv.id}.md"'},
    )
