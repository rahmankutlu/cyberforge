"""Pydantic schemas for repository content (labs, scenarios, learning, incidents, indicators).

These are the single source of truth for content validation: `pnpm validate:content` and the
API seeder both use them, and `scripts/export_schemas.py` emits JSON Schema for editors.
"""

from __future__ import annotations

import re
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
TECHNIQUE_RE = re.compile(r"^(T\d{4}(?:\.\d{3})?|AML\.T\d{4}(?:\.\d{3})?)$")

Difficulty = Literal["beginner", "intermediate", "advanced"]
Domain = Literal["web", "api", "linux", "windows-sim", "network", "cloud", "ai-security"]
Severity = Literal["critical", "high", "medium", "low", "informational"]

Slug = Annotated[str, Field(min_length=3, max_length=96)]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Reference(Strict):
    title: str = Field(min_length=3)
    url: HttpUrl


class Component(Strict):
    name: str
    role: str
    network: Literal["lab-internal", "backend", "host-localhost", "none"] = "lab-internal"


class Architecture(Strict):
    description: str = Field(min_length=20)
    diagram: str | None = Field(None, description="Mermaid diagram source")
    components: list[Component] = Field(min_length=1)


class SetupSection(Strict):
    requires_containers: bool = False
    compose_profile: str | None = Field(
        None, description="docker compose profile that starts the lab services"
    )
    steps: list[str] = Field(min_length=1)


class TelemetrySource(Strict):
    name: str
    description: str
    log_source: str = Field(description="Sigma logsource shorthand, e.g. windows/process_creation")


class TelemetrySection(Strict):
    sources: list[TelemetrySource] = Field(min_length=1)
    scenario_file: str = "telemetry/scenario.jsonl"


class SimulationStep(Strict):
    title: str
    detail: str


class AttackSimulation(Strict):
    description: str = Field(min_length=20)
    steps: list[SimulationStep] = Field(min_length=2)


class ExpectedDetection(Strict):
    description: str = Field(min_length=20)
    rules: list[str] = Field(min_length=1, description="Slugs of detection rules that must fire")


class InvestigationQuestion(Strict):
    question: str
    hint: str
    answer: str


class Safety(Strict):
    scope: Literal["simulation-only", "local-container"] = "simulation-only"
    network: Literal["none", "lab-internal"] = "none"
    allowed_targets: list[str] = Field(
        default_factory=list,
        description="Extra lab hostnames this lab may reference (must end in .lab.internal)",
    )

    @field_validator("allowed_targets")
    @classmethod
    def _lab_hostnames_only(cls, values: list[str]) -> list[str]:
        for v in values:
            if not v.endswith(".lab.internal"):
                raise ValueError(f"allowed target {v!r} must end with .lab.internal")
        return values


class LabDoc(Strict):
    slug: Slug
    number: int = Field(ge=1, le=999)
    title: str = Field(min_length=3, max_length=120)
    domain: Domain
    category: str
    difficulty: Difficulty
    duration_minutes: int = Field(ge=5, le=480)
    summary: str = Field(min_length=20, max_length=300)
    tags: list[str] = Field(default_factory=list)
    objectives: list[str] = Field(min_length=2)
    architecture: Architecture
    scenario: str = Field(min_length=40)
    setup: SetupSection
    telemetry: TelemetrySection
    attack_simulation: AttackSimulation
    expected_detection: ExpectedDetection
    mitre: list[str] = Field(min_length=1)
    investigation_questions: list[InvestigationQuestion] = Field(min_length=2)
    mitigation: list[str] = Field(min_length=2)
    cleanup: list[str] = Field(min_length=1)
    references: list[Reference] = Field(min_length=1)
    safety: Safety = Field(default_factory=Safety)

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError("slug must be lowercase kebab-case")
        return v

    @field_validator("mitre")
    @classmethod
    def _mitre_shape(cls, values: list[str]) -> list[str]:
        for v in values:
            if not TECHNIQUE_RE.match(v):
                raise ValueError(f"{v!r} is not a valid ATT&CK / ATLAS technique identifier")
        return values


class LabTestsDoc(Strict):
    """`tests/lab.tests.yml`: extra assertions about what a lab's scenario must (not) trigger."""

    min_events: int = Field(1, ge=1, description="The scenario must contain at least this many events")
    must_fire: list[str] = Field(
        default_factory=list, description="Rule slugs that must fire (in addition to lab.yaml)"
    )
    must_not_fire: list[str] = Field(
        default_factory=list, description="Rule slugs that must stay quiet on this scenario"
    )


class ScenarioEvent(Strict):
    """One telemetry event in a lab scenario or dataset. `t` is seconds from scenario start.

    `repeat`/`every` expand one line into a burst. Inside string values, `{i}` is the 0-based
    repeat index; `{i+N}` and `{i*N}` do simple arithmetic (a value that is only a placeholder
    becomes an integer).
    """

    t: float = Field(ge=0)
    repeat: int = Field(1, ge=1, le=500)
    every: float = Field(1.0, ge=0)
    category: str
    host: str | None = None
    user: str | None = None
    action: str | None = None
    outcome: Literal["success", "failure", "blocked", "allowed", "unknown"] | None = None
    fields: dict[str, Any] = Field(default_factory=dict)
    note: str | None = Field(None, description="Human explanation shown in the lifecycle view")


# --- learning -------------------------------------------------------------------------------


class ModuleDoc(Strict):
    slug: Slug
    title: str
    summary: str
    duration_minutes: int = Field(ge=5, le=240)
    body: str = Field(min_length=80, description="Markdown lesson content")
    labs: list[str] = Field(default_factory=list)
    rules: list[str] = Field(default_factory=list)
    techniques: list[str] = Field(default_factory=list)


class TrackDoc(Strict):
    slug: Slug
    title: str
    audience: str
    summary: str
    icon: str = "shield"
    modules: list[ModuleDoc] = Field(min_length=3)


class DayDoc(Strict):
    day: int = Field(ge=1, le=30)
    title: str
    summary: str
    tasks: list[str] = Field(min_length=2)
    labs: list[str] = Field(default_factory=list)
    rules: list[str] = Field(default_factory=list)
    techniques: list[str] = Field(default_factory=list)
    reading: list[Reference] = Field(default_factory=list)


class ThirtyDaysDoc(Strict):
    title: str
    summary: str
    days: list[DayDoc] = Field(min_length=30, max_length=30)


# --- incidents and indicators ----------------------------------------------------------------


class IncidentNote(Strict):
    analyst: str
    body: str
    offset_minutes: int = Field(ge=0, default=0)


class IncidentTimelineEntry(Strict):
    offset_minutes: int = Field(ge=0)
    kind: Literal["detection", "evidence", "containment", "note", "status"]
    title: str
    detail: str = ""


class IncidentReportDoc(Strict):
    executive_summary: str
    affected_assets: list[str]
    indicators: list[str]
    evidence: str
    root_cause: str
    containment: str
    remediation: str
    lessons_learned: str


class IncidentDoc(Strict):
    slug: Slug
    title: str
    lab: str = Field(description="Slug of the lab whose simulated telemetry backs this incident")
    severity: Severity
    status: Literal["open", "in_progress", "contained", "closed"]
    lead: str
    days_ago: int = Field(ge=0, le=60)
    summary: str
    alert_status: Literal["new", "investigating", "contained", "resolved", "false_positive"]
    notes: list[IncidentNote] = Field(default_factory=list)
    timeline: list[IncidentTimelineEntry] = Field(default_factory=list)
    report: IncidentReportDoc | None = None


class IndicatorDoc(Strict):
    type: Literal["ip", "domain", "url", "sha256", "email", "cve", "asn"]
    value: str
    tags: list[str] = Field(default_factory=list)
    confidence: int = Field(ge=0, le=100)
    source: str
    tlp: Literal["clear", "green", "amber"] = "clear"
    first_seen_days_ago: int = Field(ge=0, default=30)
    last_seen_days_ago: int = Field(ge=0, default=1)
    notes: str = ""


class AnalystDoc(Strict):
    handle: str
    name: str
    role: str


# --- playground datasets ---------------------------------------------------------------------


class SampleFile(Strict):
    """A synthetic file for YARA. `content` may be split into parts and is joined on load.

    Splitting keeps antivirus products on contributors' machines from quarantining well-known test
    strings (such as the EICAR file) inside the repository. `hex_prefix` prepends raw bytes, for
    rules that check magic numbers.
    """

    name: str = Field(min_length=3, max_length=80)
    description: str = Field(min_length=10)
    content: str | list[str] = ""
    hex_prefix: str | None = Field(None, pattern=r"^(?:[0-9A-Fa-f]{2})+$")

    def text(self) -> str:
        return "".join(self.content) if isinstance(self.content, list) else self.content


class PlaygroundDataset(Strict):
    """A curated, synthetic dataset for the detection playground.

    `expected_rules` is a contract, checked in CI: every listed rule must fire on the dataset.
    Other rules may fire too; the playground shows them as "also matched".
    """

    slug: Slug
    name: str = Field(min_length=3, max_length=80)
    description: str = Field(min_length=30)
    source_type: str = Field(min_length=3, description="What produced these logs, e.g. Sysmon EID 1")
    kind: Literal["events", "files"] = "events"
    difficulty: Difficulty = "beginner"
    mitre: list[str] = Field(default_factory=list)
    expected_rules: list[str] = Field(min_length=1)
    try_this: list[str] = Field(default_factory=list, description="Suggested things to try")
    events: list[ScenarioEvent] = Field(default_factory=list)
    files: list[SampleFile] = Field(default_factory=list)

    @field_validator("mitre")
    @classmethod
    def _mitre_shape(cls, values: list[str]) -> list[str]:
        for v in values:
            if not TECHNIQUE_RE.match(v):
                raise ValueError(f"{v!r} is not a valid ATT&CK / ATLAS technique identifier")
        return values

    @model_validator(mode="after")
    def _has_content(self) -> PlaygroundDataset:
        if self.kind == "events" and not self.events:
            raise ValueError("an events dataset needs `events`")
        if self.kind == "files" and not self.files:
            raise ValueError("a files dataset needs `files`")
        return self
