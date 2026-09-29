"""Attack stories: complete, synthetic attack-and-defence narratives, one YAML file each.

A story walks an analyst through an incident in time order. Every step carries the telemetry that
would exist at that moment, curated evidence, the detections that fire, a question or a decision,
and (optionally) a fragment of the investigation graph. After the last step the analyst chooses
containment actions, then reads the post-incident explanation.

Stories are file-driven: `stories/<slug>.yaml`. Nothing about a story is stored in the database;
progress lives in the learner's browser.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from cyberforge.content.schemas import (
    SLUG_RE,
    TECHNIQUE_RE,
    Difficulty,
    ScenarioEvent,
    Severity,
    Slug,
)

_ID = re.compile(r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")
_CLOCK = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")

StoryDomain = Literal["endpoint", "identity", "web", "network", "cloud", "ai-security"]
GraphNodeType = Literal["user", "host", "process", "ip", "domain", "detection", "alert", "technique"]
GraphRelation = Literal["executed", "connected to", "triggered", "mapped to", "associated with"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Evidence(_Strict):
    id: str = Field(description="Unique within the story")
    title: str = Field(min_length=3, max_length=100)
    kind: Literal["log", "process-tree", "network", "email", "ticket", "note", "alert"] = "log"
    content: str = Field(min_length=3, description="Shown verbatim in a code block")
    significance: Literal["key", "supporting", "noise"] = "supporting"
    finding: str | None = Field(
        None, description="Why this matters. Shown when the analyst marks it as a finding."
    )

    @field_validator("id")
    @classmethod
    def _id(cls, v: str) -> str:
        if not _ID.match(v):
            raise ValueError("id must be lowercase letters, digits, - or _")
        return v


class QuestionOption(_Strict):
    id: str
    text: str = Field(min_length=2)
    correct: bool = False
    explanation: str = Field(min_length=5, description="Shown after the analyst answers")


class Question(_Strict):
    id: str
    prompt: str = Field(min_length=10)
    kind: Literal["single", "multiple"] = "single"
    options: list[QuestionOption] = Field(min_length=2, max_length=8)
    hint: str | None = None

    @model_validator(mode="after")
    def _answers(self) -> Question:
        ids = [o.id for o in self.options]
        if len(set(ids)) != len(ids):
            raise ValueError(f"question {self.id}: duplicate option ids")
        correct = sum(o.correct for o in self.options)
        if self.kind == "single" and correct != 1:
            raise ValueError(f"question {self.id}: a single-answer question needs exactly one correct option")
        if self.kind == "multiple" and correct < 1:
            raise ValueError(f"question {self.id}: a multiple-answer question needs a correct option")
        return self


class DecisionOption(_Strict):
    id: str
    text: str = Field(min_length=3)
    quality: Literal["best", "acceptable", "poor"]
    feedback: str = Field(min_length=10)


class Decision(_Strict):
    id: str
    prompt: str = Field(min_length=10)
    context: str | None = None
    options: list[DecisionOption] = Field(min_length=2, max_length=5)

    @model_validator(mode="after")
    def _has_best(self) -> Decision:
        if not any(o.quality == "best" for o in self.options):
            raise ValueError(f"decision {self.id}: needs at least one 'best' option")
        return self


class GraphNode(_Strict):
    id: str
    type: GraphNodeType
    label: str = Field(min_length=1, max_length=60)
    ref: str | None = Field(
        None, description="detection: rule slug. technique: MITRE id. Others: not used."
    )


class GraphEdge(_Strict):
    source: str
    target: str
    relation: GraphRelation


class StepAlert(_Strict):
    title: str = Field(min_length=5)
    severity: Severity
    rule: str | None = Field(None, description="Slug of the rule that raised it")


class Step(_Strict):
    id: str
    time: str = Field(description="Clock time HH:MM. Telemetry offsets are relative to it.")
    title: str = Field(min_length=3, max_length=80)
    narrative: str = Field(min_length=20, description="What the analyst sees at this point")
    telemetry: list[ScenarioEvent] = Field(min_length=1)
    evidence: list[Evidence] = Field(min_length=1)
    detections: list[str] = Field(
        default_factory=list, description="Slugs of the rules that fire on this step's telemetry"
    )
    alert: StepAlert | None = None
    techniques: list[str] = Field(default_factory=list)
    questions: list[Question] = Field(default_factory=list)
    decision: Decision | None = None
    graph_nodes: list[GraphNode] = Field(default_factory=list)
    graph_edges: list[GraphEdge] = Field(default_factory=list)

    @field_validator("id")
    @classmethod
    def _id(cls, v: str) -> str:
        if not _ID.match(v):
            raise ValueError("id must be lowercase letters, digits, - or _")
        return v

    @field_validator("time")
    @classmethod
    def _clock(cls, v: str) -> str:
        if not _CLOCK.match(v):
            raise ValueError("time must be HH:MM (24 hour)")
        return v

    @field_validator("techniques")
    @classmethod
    def _techniques(cls, values: list[str]) -> list[str]:
        for v in values:
            if not TECHNIQUE_RE.match(v):
                raise ValueError(f"{v!r} is not a valid ATT&CK / ATLAS technique identifier")
        return values


class ChainLink(_Strict):
    tactic: str = Field(min_length=3, description="Tactic name, e.g. Execution")
    technique: str
    step: str = Field(description="Id of the step where it happens")
    description: str = Field(min_length=10, description="What the attacker did, in one sentence")

    @field_validator("technique")
    @classmethod
    def _technique(cls, v: str) -> str:
        if not TECHNIQUE_RE.match(v):
            raise ValueError(f"{v!r} is not a valid ATT&CK / ATLAS technique identifier")
        return v


class ContainmentOption(_Strict):
    id: str
    action: str = Field(min_length=5, max_length=120)
    category: Literal["isolate", "credentials", "block", "eradicate", "monitor", "communicate", "other"]
    quality: Literal["recommended", "optional", "harmful"]
    effect: str = Field(min_length=10, description="What this action achieves, or costs")
    feedback: str = Field(min_length=10, description="Shown after the analyst submits")


class Postmortem(_Strict):
    summary: str = Field(min_length=40)
    root_cause: str = Field(min_length=20)
    what_worked: list[str] = Field(min_length=1)
    what_to_improve: list[str] = Field(min_length=1)
    detections_to_add: list[str] = Field(default_factory=list)
    lessons: list[str] = Field(min_length=2)


class StoryDoc(_Strict):
    slug: Slug
    title: str = Field(min_length=5, max_length=80)
    summary: str = Field(min_length=40, max_length=320)
    difficulty: Difficulty
    duration_minutes: int = Field(ge=5, le=120)
    domain: StoryDomain
    tags: list[str] = Field(default_factory=list)
    order: int = Field(100, ge=1, le=999, description="Position in the story list")
    briefing: str = Field(min_length=60, description="The ticket the analyst starts from")
    attack_chain: list[ChainLink] = Field(min_length=3)
    steps: list[Step] = Field(min_length=4, max_length=12)
    containment: list[ContainmentOption] = Field(min_length=4, max_length=10)
    postmortem: Postmortem

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError("slug must be lowercase kebab-case")
        return v

    def techniques(self) -> set[str]:
        found = {t for s in self.steps for t in s.techniques}
        found |= {c.technique for c in self.attack_chain}
        return found

    def detection_slugs(self) -> set[str]:
        return {d for s in self.steps for d in s.detections}
