"""Shared response building blocks."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")

SEVERITIES = ("critical", "high", "medium", "low", "informational")
ALERT_STATUSES = ("new", "investigating", "contained", "resolved", "false_positive")
INVESTIGATION_STATUSES = ("open", "in_progress", "contained", "closed")


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


def paginate(items: list[Any], total: int, page: int, page_size: int) -> dict[str, Any]:
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
    }


class AnalystOut(ORM):
    id: int
    handle: str
    name: str
    role: str


class TechniqueRef(ORM):
    id: str
    name: str
    framework: str


class TacticOut(ORM):
    id: str
    framework: str
    shortname: str
    name: str
    description: str = ""
    url: str = ""
    position: int = 0


class RuleRef(ORM):
    id: int
    slug: str
    title: str
    level: str
    format: str


class LabRef(ORM):
    id: int
    slug: str
    title: str
    number: int
    domain: str


class EventOut(ORM):
    id: int
    timestamp: datetime
    source: str
    category: str
    logsource: dict[str, Any]
    host: str | None
    user: str | None
    action: str | None
    outcome: str | None
    src_ip: str | None
    dst_ip: str | None
    dst_port: int | None
    process: str | None
    parent_process: str | None
    command_line: str | None
    message: str
    raw: str
    fields: dict[str, Any]
    note: str | None
    synthetic: bool
    dataset: str | None
    lab_run_id: int | None


class EventSummary(ORM):
    id: int
    timestamp: datetime
    source: str
    category: str
    host: str | None
    user: str | None
    action: str | None
    outcome: str | None
    src_ip: str | None
    message: str
    synthetic: bool
    lab_run_id: int | None


class Message(BaseModel):
    detail: str = Field(examples=["ok"])
