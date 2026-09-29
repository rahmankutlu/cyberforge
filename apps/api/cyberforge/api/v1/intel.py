"""Threat-intel workspace. Indicators are local: nothing is ever sent to a third-party service."""

from __future__ import annotations

import ipaddress
import re
from typing import Annotated, Any, Literal

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import joinedload

from cyberforge.api.deps import PageDep, SessionDep, escape_like
from cyberforge.db import utcnow
from cyberforge.models import Alert, Event, Indicator, alert_events
from cyberforge.schemas.common import Page, paginate
from cyberforge.schemas.misc import IndicatorCreate, IndicatorDetail, IndicatorOut, IndicatorPatch
from cyberforge.schemas.soc import AlertSummary

router = APIRouter(tags=["threat-intel"])

_VALIDATORS = {
    "sha256": re.compile(r"^[a-fA-F0-9]{64}$"),
    "cve": re.compile(r"^CVE-\d{4}-\d{4,}$", re.IGNORECASE),
    "asn": re.compile(r"^AS\d{1,10}$", re.IGNORECASE),
    "email": re.compile(r"^[^@\s]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,}$"),
    "domain": re.compile(r"^(?=.{1,253}$)([A-Za-z0-9-]{1,63}\.)+[A-Za-z0-9-]{2,63}$"),
    "url": re.compile(r"^https?://[^\s]{3,2000}$", re.IGNORECASE),
}


def normalise(kind: str, value: str) -> str:
    value = value.strip()
    if kind == "ip":
        try:
            return str(ipaddress.ip_address(value))
        except ValueError as exc:
            raise HTTPException(422, "Invalid IP address") from exc
    pattern = _VALIDATORS.get(kind)
    if pattern is None or not pattern.match(value):
        raise HTTPException(422, f"Invalid {kind} indicator")
    if kind in ("sha256", "domain", "email"):
        return value.lower()
    if kind in ("cve", "asn"):
        return value.upper()
    return value


def _related_alerts(session: SessionDep, ind: Indicator) -> list[Alert]:
    """Alerts whose evidence events mention the indicator (local substring match, no enrichment)."""
    needle = f"%{escape_like(ind.value.lower())}%"
    event_ids = select(Event.id).where(
        or_(
            func.lower(Event.raw).like(needle, escape="\\"),
            func.lower(Event.message).like(needle, escape="\\"),
            func.lower(func.coalesce(Event.src_ip, "")).like(needle, escape="\\"),
            func.lower(func.coalesce(Event.dst_ip, "")).like(needle, escape="\\"),
        )
    )
    alert_ids = select(alert_events.c.alert_id).where(alert_events.c.event_id.in_(event_ids))
    return list(
        session.scalars(
            select(Alert).where(or_(Alert.id.in_(alert_ids), func.lower(func.coalesce(Alert.description, "")).like(needle, escape="\\")))
            .options(joinedload(Alert.rule), joinedload(Alert.technique), joinedload(Alert.assignee)).order_by(Alert.timestamp.desc()).limit(10)
        ).unique()
    )  # fmt: skip


@router.get("/indicators", response_model=Page[IndicatorOut], summary="Search indicators")
def list_indicators(
    session: SessionDep,
    paging: PageDep,
    type: Annotated[str | None, Query(pattern="^(ip|domain|url|sha256|email|cve|asn)$")] = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    tag: Annotated[str | None, Query(max_length=64)] = None,
    min_confidence: Annotated[int, Query(ge=0, le=100)] = 0,
    sort: Annotated[
        str, Query(pattern="^(last_seen|first_seen|confidence|value|type)$")
    ] = "last_seen",
    order: Literal["asc", "desc"] = "desc",
) -> dict[str, Any]:
    stmt = select(Indicator).where(Indicator.confidence >= min_confidence)
    if type:
        stmt = stmt.where(Indicator.type == type)
    if q:
        like = f"%{escape_like(q.lower())}%"
        stmt = stmt.where(
            or_(
                func.lower(Indicator.value).like(like, escape="\\"),
                func.lower(Indicator.notes).like(like, escape="\\"),
                func.lower(Indicator.source).like(like, escape="\\"),
            )
        )
    rows = list(session.scalars(stmt))
    if tag:  # JSON containment is dialect-specific; the table is small, so filter in Python
        rows = [r for r in rows if tag.lower() in [t.lower() for t in r.tags]]
    reverse = order == "desc"
    rows.sort(key=lambda r: getattr(r, sort), reverse=reverse)
    total = len(rows)
    page = rows[paging.offset : paging.offset + paging.page_size]
    return paginate(
        [IndicatorOut.model_validate(r) for r in page], total, paging.page, paging.page_size
    )


@router.get(
    "/indicators/{indicator_id}",
    response_model=IndicatorDetail,
    summary="Indicator detail with related alerts",
)
def get_indicator(indicator_id: int, session: SessionDep) -> IndicatorDetail:
    ind = session.get(Indicator, indicator_id)
    if ind is None:
        raise HTTPException(404, "Indicator not found")
    return IndicatorDetail(
        **IndicatorOut.model_validate(ind).model_dump(),
        related_alerts=[AlertSummary.model_validate(a) for a in _related_alerts(session, ind)],
    )


@router.post(
    "/indicators",
    response_model=IndicatorOut,
    status_code=201,
    summary="Manually import an indicator",
)
def create_indicator(body: IndicatorCreate, session: SessionDep) -> Indicator:
    value = normalise(body.type, body.value)
    if session.scalar(
        select(Indicator.id).where(Indicator.type == body.type, Indicator.value == value)
    ):
        raise HTTPException(409, "Indicator already exists")
    now = utcnow()
    ind = Indicator(
        type=body.type, value=value, tags=sorted({t.strip().lower() for t in body.tags if t.strip()}), confidence=body.confidence,
        source=body.source, tlp=body.tlp, notes=body.notes, first_seen=now, last_seen=now, synthetic=False,
    )  # fmt: skip
    session.add(ind)
    session.flush()
    return ind


@router.patch(
    "/indicators/{indicator_id}",
    response_model=IndicatorOut,
    summary="Update tags, confidence or notes",
)
def patch_indicator(indicator_id: int, body: IndicatorPatch, session: SessionDep) -> Indicator:
    ind = session.get(Indicator, indicator_id)
    if ind is None:
        raise HTTPException(404, "Indicator not found")
    if body.tags is not None:
        ind.tags = sorted({t.strip().lower() for t in body.tags if t.strip()})
    for key in ("confidence", "notes", "tlp"):
        value = getattr(body, key)
        if value is not None:
            setattr(ind, key, value)
    ind.last_seen = utcnow()
    session.flush()
    return ind


@router.delete("/indicators/{indicator_id}", status_code=204, summary="Delete an indicator")
def delete_indicator(indicator_id: int, session: SessionDep) -> None:
    ind = session.get(Indicator, indicator_id)
    if ind is None:
        raise HTTPException(404, "Indicator not found")
    session.delete(ind)
