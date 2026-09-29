"""Labs and lab runs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from cyberforge.schemas.common import ORM, RuleRef, TechniqueRef
from cyberforge.schemas.soc import AlertSummary


class LabSummary(ORM):
    id: int
    slug: str
    number: int
    title: str
    difficulty: str
    category: str
    domain: str
    duration_minutes: int
    summary: str
    techniques: list[TechniqueRef]
    rule_count: int = 0
    run_count: int = 0
    last_run_at: datetime | None = None
    requires_containers: bool = False


class LabDetail(LabSummary):
    document: dict[str, Any]
    rules: list[RuleRef]
    scenario_event_count: int


class LabRunCreate(BaseModel):
    lab_slug: str = Field(min_length=3, max_length=96)
    target: str | None = Field(
        None,
        max_length=253,
        description="Optional lab target. Must be localhost, a private address or *.lab.internal.",
    )


class LabRunOut(ORM):
    id: int
    lab_id: int
    lab_slug: str
    lab_title: str
    status: str
    mode: str
    target: str | None
    started_at: datetime
    finished_at: datetime | None
    events_generated: int
    alerts_generated: int
    synthetic: bool


class LabRunDetail(LabRunOut):
    alerts: list[AlertSummary]
    event_ids: list[int]
    expected_rules: list[str]
    fired_rules: list[str]
    missing_rules: list[str]
