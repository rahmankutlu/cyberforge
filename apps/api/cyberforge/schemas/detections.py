"""Detection rules, validation, translation, testing."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from cyberforge.schemas.common import ORM, TechniqueRef

RuleFormat = Literal["sigma", "yara", "suricata"]


class RuleSummary(ORM):
    id: int
    slug: str
    title: str
    format: RuleFormat
    status: str
    level: str
    enabled: bool
    origin: str
    is_correlation: bool
    author: str
    logsource: dict[str, Any]
    techniques: list[TechniqueRef]
    lab_count: int = 0
    alert_count: int = 0
    updated_at: datetime


class RuleDetail(RuleSummary):
    description: str
    content: str
    tags: list[str]
    false_positives: list[str]
    references: list[str]
    source_path: str
    labs: list[dict[str, Any]] = Field(default_factory=list)
    recent_alert_ids: list[int] = Field(default_factory=list)


class RuleCreate(BaseModel):
    content: str = Field(min_length=10, max_length=65536)
    format: RuleFormat = "sigma"


class RulePatch(BaseModel):
    enabled: bool | None = None
    content: str | None = Field(None, min_length=10, max_length=65536)


class ValidateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=65536)
    format: RuleFormat = "sigma"


class RuleMeta(BaseModel):
    title: str
    id: str | None
    status: str | None
    level: str
    description: str
    author: str
    logsource: dict[str, str]
    tags: list[str]
    techniques: list[str]
    falsepositives: list[str]
    references: list[str]
    is_correlation: bool
    fields: list[str]


class MitreLookup(BaseModel):
    id: str
    name: str | None
    known: bool


class ValidateResponse(BaseModel):
    valid: bool
    format: RuleFormat
    errors: list[str]
    warnings: list[str]
    meta: RuleMeta | None
    mitre: list[MitreLookup]


class TranslateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=65536)
    targets: list[Literal["elastic", "splunk", "sentinel", "opensearch", "sql"]] | None = None


class TranslationOut(BaseModel):
    target: str
    label: str
    language: str
    queries: list[str]
    error: str | None
    notes: list[str]


class TranslateResponse(BaseModel):
    validation: ValidateResponse
    translations: list[TranslationOut]


class TestEvent(BaseModel):
    fields: dict[str, Any] = Field(max_length=200)
    category: str | None = Field(None, max_length=48)
    logsource: dict[str, str] | None = None


class TestRequest(BaseModel):
    content: str = Field(min_length=1, max_length=65536)
    events: list[TestEvent] | None = Field(None, max_length=500)
    lab_slug: str | None = Field(None, description="Test against a lab's scenario events instead")


class TestMatch(BaseModel):
    index: int
    matched: bool
    trace: list[dict[str, Any]]
    summary: str


class TestResponse(BaseModel):
    valid: bool
    errors: list[str]
    event_count: int
    matched_count: int
    matches: list[TestMatch]
    correlation: list[dict[str, Any]]
