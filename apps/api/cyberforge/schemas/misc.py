"""MITRE explorer, threat intel, learning, dashboard, AI, search, settings."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from cyberforge.schemas.common import ORM, LabRef, RuleRef, TacticOut
from cyberforge.schemas.soc import AlertSummary

# --- MITRE ---------------------------------------------------------------------------------


class TechniqueCoverage(BaseModel):
    id: str
    name: str
    framework: str
    is_subtechnique: bool
    parent_id: str | None
    tactic_ids: list[str]
    labs: int
    rules: int
    alerts: int
    investigations: int
    stories: int = 0  # attack stories that teach it
    tested_rules: int = 0  # mapped Sigma rules with positive and negative tests
    lacking_tests: bool = False  # something covers it, but no tested rule does
    domains: list[str] = []  # Windows, Linux, Network, Web, Cloud, AI Security


class TechniqueDetail(TechniqueCoverage):
    description: str
    url: str
    platforms: list[str]
    mitigations: list[dict[str, Any]]
    tactics: list[TacticOut]
    lab_refs: list[LabRef]
    rule_refs: list[RuleRef]
    recent_alerts: list[AlertSummary]
    sub_techniques: list[TechniqueCoverage]


class MatrixColumn(BaseModel):
    tactic: TacticOut
    techniques: list[TechniqueCoverage]


class MatrixResponse(BaseModel):
    framework: str
    version: str
    notice: str
    columns: list[MatrixColumn]
    totals: dict[str, int]


# --- threat intel --------------------------------------------------------------------------

IndicatorType = Literal["ip", "domain", "url", "sha256", "email", "cve", "asn"]


class IndicatorOut(ORM):
    id: int
    type: IndicatorType
    value: str
    tags: list[str]
    confidence: int
    source: str
    tlp: str
    first_seen: datetime
    last_seen: datetime
    notes: str
    synthetic: bool


class IndicatorDetail(IndicatorOut):
    related_alerts: list[AlertSummary]


class IndicatorCreate(BaseModel):
    type: IndicatorType
    value: str = Field(min_length=1, max_length=512)
    tags: list[str] = Field(default_factory=list, max_length=20)
    confidence: int = Field(50, ge=0, le=100)
    source: str = Field("manual import", max_length=128)
    tlp: Literal["clear", "green", "amber"] = "clear"
    notes: str = Field("", max_length=4000)


class IndicatorPatch(BaseModel):
    tags: list[str] | None = Field(None, max_length=20)
    confidence: int | None = Field(None, ge=0, le=100)
    notes: str | None = Field(None, max_length=4000)
    tlp: Literal["clear", "green", "amber"] | None = None


# --- learning ------------------------------------------------------------------------------


class ModuleSummary(ORM):
    slug: str
    track: str
    position: int
    title: str
    summary: str
    duration_minutes: int
    day: int | None
    lab_slugs: list[str]
    rule_slugs: list[str]
    technique_ids: list[str]


class ModuleDetail(ModuleSummary):
    body: str


class TrackOut(BaseModel):
    slug: str
    title: str
    audience: str
    summary: str
    icon: str
    modules: list[ModuleSummary]
    total_minutes: int


class LearningOverview(BaseModel):
    tracks: list[TrackOut]
    thirty_days: TrackOut | None


class ProgressOut(BaseModel):
    profile_id: str
    completed: list[str]


class ProgressUpdate(BaseModel):
    completed: list[str] = Field(max_length=500)


# --- dashboard ------------------------------------------------------------------------------


class Kpi(BaseModel):
    key: str
    label: str
    value: float
    unit: str | None = None
    hint: str | None = None


class TimelinePoint(BaseModel):
    bucket: datetime
    critical: int
    high: int
    medium: int
    low: int
    informational: int
    events: int


class CoverageSlice(BaseModel):
    tactic: TacticOut
    covered: int
    total: int


class DashboardResponse(BaseModel):
    generated_at: datetime
    demo_mode: bool
    synthetic_notice: str
    posture_score: int
    posture_breakdown: dict[str, float]
    kpis: list[Kpi]
    timeline: list[TimelinePoint]
    recent_alerts: list[AlertSummary]
    recent_investigations: list[dict[str, Any]]
    lab_progress: dict[str, int]
    coverage: list[CoverageSlice]


# --- AI --------------------------------------------------------------------------------------


class AIStatus(BaseModel):
    enabled: bool
    provider: str
    model: str | None
    reason: str | None = None
    safety: list[str]


class AnalyzeRequest(BaseModel):
    alert_id: int


class AIAnalysisContent(BaseModel):
    summary: str
    severity_explanation: str
    likely_technique: str
    why_rule_triggered: str
    evidence_to_review: list[str]
    investigation_steps: list[str]
    false_positives: list[str]
    containment_suggestions: list[str]


class AnalyzeResponse(BaseModel):
    available: bool
    ai_generated: bool = True
    provider: str
    model: str | None
    disclaimer: str
    reason: str | None = None
    analysis: AIAnalysisContent | None = None
    analysis_id: int | None = None
    created_at: datetime | None = None


# --- AI security -----------------------------------------------------------------------------


class TrustBoundary(BaseModel):
    id: str
    from_node: str
    to_node: str
    title: str
    description: str
    failure_modes: list[str]
    controls: list[str]
    rules: list[str]


class AIFinding(BaseModel):
    alert: AlertSummary
    boundary_id: str | None
    boundary_title: str | None
    what_failed: str
    control: str


class AISecurityOverview(BaseModel):
    nodes: list[dict[str, str]]
    boundaries: list[TrustBoundary]
    topics: list[dict[str, Any]]
    labs: list[dict[str, Any]]
    finding_count: int


# --- search / docs / settings -----------------------------------------------------------------


class SearchHit(BaseModel):
    kind: Literal[
        "lab", "story", "rule", "dataset", "technique", "alert", "doc", "learning", "indicator"
    ]
    id: str
    title: str
    subtitle: str | None = None
    href: str
    badge: str | None = None


class SearchResponse(BaseModel):
    query: str
    hits: list[SearchHit]


class DocSummary(BaseModel):
    slug: str
    title: str
    path: str


class DocPageOut(DocSummary):
    markdown: str


class RuntimeSettings(BaseModel):
    version: str
    env: str
    demo_mode: bool
    ai: AIStatus
    content: dict[str, Any]
    counts: dict[str, int]
    lab_network: dict[str, str]
