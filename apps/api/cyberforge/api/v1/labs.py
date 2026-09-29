"""Labs and lab runs."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import joinedload, selectinload

from cyberforge.api.deps import SessionDep, escape_like
from cyberforge.models import Alert, Event, Lab, LabRun, lab_rules
from cyberforge.schemas.common import RuleRef, TechniqueRef
from cyberforge.schemas.labs import LabDetail, LabRunCreate, LabRunDetail, LabRunOut, LabSummary
from cyberforge.schemas.soc import AlertSummary
from cyberforge.services import guardrails
from cyberforge.services.labs import run_lab

router = APIRouter(tags=["labs"])


def _summaries(session: SessionDep, labs: list[Lab]) -> list[LabSummary]:
    ids = [lab.id for lab in labs]
    runs = {
        lab_id: (count, last)
        for lab_id, count, last in session.execute(
            select(LabRun.lab_id, func.count(), func.max(LabRun.started_at))
            .where(LabRun.lab_id.in_(ids))
            .group_by(LabRun.lab_id)
        )
    }
    rule_counts: dict[int, int] = dict(
        session.execute(
            select(lab_rules.c.lab_id, func.count())
            .where(lab_rules.c.lab_id.in_(ids))
            .group_by(lab_rules.c.lab_id)
        ).all()
    )
    out = []
    for lab in labs:
        count, last = runs.get(lab.id, (0, None))
        out.append(
            LabSummary(
                id=lab.id, slug=lab.slug, number=lab.number, title=lab.title, difficulty=lab.difficulty,
                category=lab.category, domain=lab.domain, duration_minutes=lab.duration_minutes,
                summary=lab.summary, techniques=[TechniqueRef.model_validate(t) for t in lab.techniques],
                rule_count=rule_counts.get(lab.id, 0), run_count=count, last_run_at=last,
                requires_containers=bool(lab.document.get("setup", {}).get("requires_containers")),
            )
        )  # fmt: skip
    return out


@router.get("/labs", response_model=list[LabSummary], summary="List labs")
def list_labs(
    session: SessionDep,
    domain: Annotated[str | None, Query(max_length=32)] = None,
    difficulty: Annotated[str | None, Query(max_length=16)] = None,
    category: Annotated[str | None, Query(max_length=64)] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> list[LabSummary]:
    stmt = select(Lab).options(selectinload(Lab.techniques)).order_by(Lab.number)
    if domain:
        stmt = stmt.where(Lab.domain == domain)
    if difficulty:
        stmt = stmt.where(Lab.difficulty == difficulty)
    if category:
        stmt = stmt.where(Lab.category == category)
    if q:
        like = f"%{escape_like(q.lower())}%"
        stmt = stmt.where(
            func.lower(Lab.title).like(like, escape="\\")
            | func.lower(Lab.summary).like(like, escape="\\")
        )
    return _summaries(session, list(session.scalars(stmt)))


@router.get("/labs/{slug}", response_model=LabDetail, summary="Get a lab")
def get_lab(slug: str, session: SessionDep) -> LabDetail:
    lab = session.scalar(
        select(Lab)
        .where(Lab.slug == slug)
        .options(selectinload(Lab.techniques), selectinload(Lab.rules))
    )
    if lab is None:
        raise HTTPException(404, "Lab not found")
    summary = _summaries(session, [lab])[0]
    return LabDetail(
        **summary.model_dump(),
        document=lab.document,
        rules=[RuleRef.model_validate(r) for r in lab.rules],
        scenario_event_count=len(lab.scenario_events),
    )


def _run_out(run: LabRun, lab: Lab) -> LabRunOut:
    return LabRunOut(
        id=run.id, lab_id=run.lab_id, lab_slug=lab.slug, lab_title=lab.title, status=run.status, mode=run.mode,
        target=run.target, started_at=run.started_at, finished_at=run.finished_at,
        events_generated=run.events_generated, alerts_generated=run.alerts_generated, synthetic=run.synthetic,
    )  # fmt: skip


@router.post(
    "/lab-runs", response_model=LabRunDetail, status_code=201, summary="Start a safe lab simulation"
)
def create_lab_run(body: LabRunCreate, session: SessionDep) -> LabRunDetail:
    """Replays the lab's scenario as synthetic telemetry and runs detections over it.

    No packets are sent anywhere. The optional `target` is validated against the lab guardrails.
    """
    lab = session.scalar(
        select(Lab).where(Lab.slug == body.lab_slug).options(selectinload(Lab.rules))
    )
    if lab is None:
        raise HTTPException(404, "Lab not found")
    try:
        run = run_lab(session, lab, target=body.target)
    except guardrails.TargetRejected as exc:
        raise HTTPException(422, str(exc)) from exc
    return _run_detail(session, run, lab)


def _run_detail(session: SessionDep, run: LabRun, lab: Lab) -> LabRunDetail:
    alerts = (
        session.scalars(
            select(Alert)
            .where(Alert.lab_run_id == run.id)
            .options(
                joinedload(Alert.rule), joinedload(Alert.technique), joinedload(Alert.assignee)
            )
            .order_by(Alert.timestamp)
        )
        .unique()
        .all()
    )
    event_ids = list(
        session.scalars(
            select(Event.id).where(Event.lab_run_id == run.id).order_by(Event.timestamp)
        )
    )
    expected = list(lab.document["expected_detection"]["rules"])
    fired = sorted({a.rule.slug for a in alerts if a.rule})
    return LabRunDetail(
        **_run_out(run, lab).model_dump(),
        alerts=[AlertSummary.model_validate(a) for a in alerts],
        event_ids=event_ids,
        expected_rules=expected,
        fired_rules=fired,
        missing_rules=[r for r in expected if r not in fired],
    )


@router.get("/lab-runs", response_model=list[LabRunOut], summary="List lab runs")
def list_lab_runs(
    session: SessionDep,
    lab_slug: Annotated[str | None, Query(max_length=96)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
) -> list[LabRunOut]:
    stmt = (
        select(LabRun, Lab)
        .join(Lab, Lab.id == LabRun.lab_id)
        .order_by(LabRun.started_at.desc())
        .limit(limit)
    )
    if lab_slug:
        stmt = stmt.where(Lab.slug == lab_slug)
    return [_run_out(run, lab) for run, lab in session.execute(stmt)]


@router.get("/lab-runs/{run_id}", response_model=LabRunDetail, summary="Get a lab run")
def get_lab_run(run_id: int, session: SessionDep) -> LabRunDetail:
    run = session.get(LabRun, run_id)
    if run is None:
        raise HTTPException(404, "Lab run not found")
    lab = session.get(Lab, run.lab_id)
    assert lab is not None
    return _run_detail(session, run, lab)
