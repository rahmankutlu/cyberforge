"""Alerts, investigations, notes, reports, lifecycle."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from cyberforge.schemas.common import (
    ORM,
    AnalystOut,
    EventOut,
    LabRef,
    RuleRef,
    TacticOut,
    TechniqueRef,
)

Severity = Literal["critical", "high", "medium", "low", "informational"]
AlertStatus = Literal["new", "investigating", "contained", "resolved", "false_positive"]
InvestigationStatus = Literal["open", "in_progress", "contained", "closed"]


class NoteOut(ORM):
    id: int
    alert_id: int | None
    investigation_id: int | None
    author: AnalystOut | None
    body: str
    created_at: datetime


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=8000)
    author_id: int | None = None


class AlertSummary(ORM):
    id: int
    title: str
    severity: Severity
    status: AlertStatus
    source: str
    timestamp: datetime
    host: str | None
    user: str | None
    rule: RuleRef | None
    technique: TechniqueRef | None
    tactic: str | None
    confidence: int
    assignee: AnalystOut | None
    investigation_id: int | None
    lab_run_id: int | None
    synthetic: bool


class InvestigationRef(ORM):
    id: int
    title: str
    status: InvestigationStatus
    severity: Severity


class AIAnalysisOut(ORM):
    id: int
    alert_id: int
    provider: str
    model: str
    content: dict[str, Any]
    created_at: datetime


class AlertDetail(AlertSummary):
    description: str
    evidence: dict[str, Any]
    events: list[EventOut]
    notes: list[NoteOut]
    related_alerts: list[AlertSummary]
    investigation: InvestigationRef | None
    lab: LabRef | None
    latest_ai_analysis: AIAnalysisOut | None
    created_at: datetime
    updated_at: datetime


class AlertPatch(BaseModel):
    status: AlertStatus | None = None
    assignee_id: int | None = Field(None, description="Set to 0 to unassign")
    investigation_id: int | None = Field(None, description="Set to 0 to detach")


class AlertStats(BaseModel):
    total: int
    by_severity: dict[str, int]
    by_status: dict[str, int]
    open: int


# --- lifecycle -----------------------------------------------------------------------------


class RawEvent(BaseModel):
    id: int
    timestamp: datetime
    source: str
    raw: str
    note: str | None


class MatchTrace(BaseModel):
    field: str
    value: Any
    pattern: str


class LifecycleSimulation(BaseModel):
    lab: LabRef | None
    run_id: int | None
    description: str
    narrative: list[str]
    synthetic: bool


class LifecycleRule(BaseModel):
    id: int
    slug: str
    title: str
    level: str
    format: str
    description: str
    content: str
    logsource: dict[str, Any]
    false_positives: list[str]
    is_correlation: bool


class LifecycleMatch(BaseModel):
    trace: list[MatchTrace]
    correlation: dict[str, Any] | None
    group: dict[str, Any] | None
    explanation: str
    matched_event_ids: list[int]


class MitreMitigation(BaseModel):
    id: str
    name: str
    description: str


class LifecycleMitre(BaseModel):
    technique: TechniqueRef | None
    description: str
    url: str
    tactics: list[TacticOut]
    other_techniques: list[TechniqueRef]
    mitigations: list[MitreMitigation]


class LifecycleMitigation(BaseModel):
    source: Literal["lab", "mitre", "none"]
    actions: list[str]
    analyst_steps: list[str]


class Lifecycle(BaseModel):
    alert: AlertSummary
    simulation: LifecycleSimulation
    raw_events: list[RawEvent]
    parsed_events: list[EventOut]
    rule: LifecycleRule | None
    match: LifecycleMatch
    mitre: LifecycleMitre
    investigation: InvestigationRef | None
    mitigation: LifecycleMitigation


# --- investigations ---------------------------------------------------------------------------


class TimelineOut(ORM):
    id: int
    timestamp: datetime
    kind: str
    title: str
    detail: str
    alert_id: int | None


class TimelineCreate(BaseModel):
    kind: Literal["detection", "evidence", "containment", "note", "status"] = "note"
    title: str = Field(min_length=1, max_length=200)
    detail: str = Field("", max_length=4000)
    timestamp: datetime | None = None
    alert_id: int | None = None


class InvestigationSummary(ORM):
    id: int
    title: str
    summary: str
    status: InvestigationStatus
    severity: Severity
    lead: AnalystOut | None
    lab_slug: str | None
    created_at: datetime
    updated_at: datetime
    synthetic: bool
    alert_count: int = 0
    note_count: int = 0


class ReportOut(ORM):
    id: int
    investigation_id: int
    status: str
    executive_summary: str
    timeline: list[dict[str, Any]]
    affected_assets: list[str]
    indicators: list[str]
    mitre_techniques: list[str]
    evidence: str
    root_cause: str
    containment: str
    remediation: str
    lessons_learned: str
    updated_at: datetime


class ReportUpdate(BaseModel):
    status: Literal["draft", "final"] = "draft"
    executive_summary: str = Field("", max_length=20000)
    timeline: list[dict[str, Any]] = Field(default_factory=list, max_length=500)
    affected_assets: list[str] = Field(default_factory=list, max_length=200)
    indicators: list[str] = Field(default_factory=list, max_length=500)
    mitre_techniques: list[str] = Field(default_factory=list, max_length=100)
    evidence: str = Field("", max_length=20000)
    root_cause: str = Field("", max_length=20000)
    containment: str = Field("", max_length=20000)
    remediation: str = Field("", max_length=20000)
    lessons_learned: str = Field("", max_length=20000)


class InvestigationDetail(InvestigationSummary):
    alerts: list[AlertSummary]
    notes: list[NoteOut]
    timeline: list[TimelineOut]
    report: ReportOut | None
    techniques: list[TechniqueRef]


class InvestigationCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    summary: str = Field("", max_length=8000)
    severity: Severity = "medium"
    lead_id: int | None = None
    alert_ids: list[int] = Field(default_factory=list, max_length=200)


class InvestigationPatch(BaseModel):
    title: str | None = Field(None, min_length=3, max_length=200)
    summary: str | None = Field(None, max_length=8000)
    status: InvestigationStatus | None = None
    severity: Severity | None = None
    lead_id: int | None = Field(None, description="Set to 0 to clear")


class AlertLink(BaseModel):
    alert_ids: list[int] = Field(min_length=1, max_length=200)
