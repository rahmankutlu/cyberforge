"""Events: browsing and lab-container ingestion."""

from __future__ import annotations

import hmac
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from cyberforge.api.deps import PageDep, SessionDep, SettingsDep, escape_like
from cyberforge.db import utcnow
from cyberforge.models import Event
from cyberforge.schemas.common import EventOut, EventSummary, Page, paginate
from cyberforge.services import telemetry
from cyberforge.services.detection_engine import run_detections

router = APIRouter(tags=["events"])

SORTABLE = {
    "timestamp": Event.timestamp, "source": Event.source, "category": Event.category,
    "host": Event.host, "user": Event.user, "outcome": Event.outcome,
}  # fmt: skip


@router.get("/events", response_model=Page[EventSummary], summary="List events")
def list_events(
    session: SessionDep,
    paging: PageDep,
    q: Annotated[
        str | None,
        Query(
            max_length=200, description="Substring match on message, host, user, IPs and raw text"
        ),
    ] = None,
    category: Annotated[str | None, Query(max_length=48)] = None,
    source: Annotated[str | None, Query(max_length=48)] = None,
    host: Annotated[str | None, Query(max_length=128)] = None,
    user: Annotated[str | None, Query(max_length=128)] = None,
    outcome: Annotated[str | None, Query(max_length=24)] = None,
    lab_run_id: int | None = None,
    dataset: Annotated[str | None, Query(max_length=96)] = None,
    since: datetime | None = None,
    until: datetime | None = None,
    sort: Annotated[
        str, Query(pattern="^(timestamp|source|category|host|user|outcome)$")
    ] = "timestamp",
    order: Literal["asc", "desc"] = "desc",
) -> dict[str, Any]:
    stmt = select(Event)
    if q:
        like = f"%{escape_like(q.lower())}%"
        stmt = stmt.where(
            or_(
                *[
                    func.lower(col).like(like, escape="\\")
                    for col in (
                        Event.message,
                        Event.host,
                        Event.user,
                        Event.src_ip,
                        Event.dst_ip,
                        Event.raw,
                    )
                ]
            )
        )
    filters: list[tuple[Any, str | None]] = [
        (Event.category, category),
        (Event.source, source),
        (Event.host, host),
        (Event.user, user),
        (Event.outcome, outcome),
        (Event.dataset, dataset),
    ]
    for column, value in filters:
        if value:
            stmt = stmt.where(column == value)
    if lab_run_id is not None:
        stmt = stmt.where(Event.lab_run_id == lab_run_id)
    if since:
        stmt = stmt.where(Event.timestamp >= since)
    if until:
        stmt = stmt.where(Event.timestamp <= until)
    total = session.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    column = SORTABLE[sort]
    stmt = stmt.order_by(column.asc() if order == "asc" else column.desc(), Event.id.desc())
    rows = session.scalars(stmt.offset(paging.offset).limit(paging.page_size)).all()
    return paginate(
        [EventSummary.model_validate(r) for r in rows], total, paging.page, paging.page_size
    )


@router.get("/events/facets", summary="Distinct values for event filters")
def event_facets(session: SessionDep) -> dict[str, list[dict[str, Any]]]:
    def facet(col: Any) -> list[dict[str, Any]]:
        rows = session.execute(
            select(col, func.count())
            .where(col.is_not(None))
            .group_by(col)
            .order_by(func.count().desc())
            .limit(50)
        )
        return [{"value": v, "count": c} for v, c in rows]

    return {
        "category": facet(Event.category),
        "source": facet(Event.source),
        "host": facet(Event.host),
        "outcome": facet(Event.outcome),
    }


@router.get("/events/{event_id}", response_model=EventOut, summary="Get an event")
def get_event(event_id: int, session: SessionDep) -> Event:
    event = session.get(Event, event_id)
    if event is None:
        raise HTTPException(404, "Event not found")
    return event


# --- ingestion from lab containers -------------------------------------------------------------


class IngestEvent(BaseModel):
    category: str = Field(max_length=48)
    host: str | None = Field(None, max_length=128)
    user: str | None = Field(None, max_length=128)
    timestamp: datetime | None = None
    outcome: Literal["success", "failure", "blocked", "allowed", "unknown"] | None = None
    fields: dict[str, Any] = Field(default_factory=dict, max_length=100)


class IngestBatch(BaseModel):
    source_label: str = Field("lab", max_length=64)
    events: list[IngestEvent] = Field(min_length=1, max_length=200)


class IngestResult(BaseModel):
    accepted: int
    alerts_created: int


@router.post(
    "/events/ingest",
    response_model=IngestResult,
    status_code=202,
    summary="Ingest lab-container telemetry",
)
def ingest_events(
    batch: IngestBatch,
    session: SessionDep,
    settings: SettingsDep,
    x_lab_token: Annotated[str | None, Header()] = None,
) -> IngestResult:
    """Accepts telemetry from the intentionally vulnerable lab services on the internal lab network.

    Requires the shared lab token. Events are stored as *not synthetic* (they came from a real local
    container) and run through the same Sigma engine as everything else.
    """
    expected = settings.lab_ingest_token.get_secret_value()
    if not x_lab_token or not hmac.compare_digest(x_lab_token.encode(), expected.encode()):
        raise HTTPException(401, "Invalid or missing lab token")
    now = utcnow()
    events: list[Event] = []
    for item in batch.events:
        if not telemetry.known_category(item.category):
            raise HTTPException(422, f"Unknown event category {item.category!r}")
        ts = item.timestamp or now
        if ts.tzinfo is None:
            raise HTTPException(422, "timestamps must be timezone-aware")
        row = telemetry.normalize(
            item.category, ts, item.host, item.user, item.fields, outcome=item.outcome
        )
        events.append(Event(**row, synthetic=False, dataset=f"live:{batch.source_label}"))
    session.add_all(events)
    session.flush()
    alerts = run_detections(session, events, synthetic=False, bucket_seconds=300)
    return IngestResult(accepted=len(events), alerts_created=len(alerts))
