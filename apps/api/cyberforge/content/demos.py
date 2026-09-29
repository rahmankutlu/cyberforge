"""Demo scenarios: a scripted, deterministic incident that plays back in the browser.

A scenario is `demos/<slug>.yaml`: telemetry on a timeline (seconds from the start), analyst notes
and containment state changes. Detections, alerts, MITRE techniques, the process chain and the
incident summary are not written by hand: `services.demo` derives them by running the shipped rules
over the telemetry, so the demo can never claim a detection that does not exist.
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from cyberforge.content.schemas import SLUG_RE, ScenarioEvent, Slug

_CLOCK = re.compile(r"^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$")


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DemoNote(_Strict):
    t: float = Field(ge=0)
    analyst: str = Field(min_length=2)
    body: str = Field(min_length=20)


class DemoContainment(_Strict):
    t: float = Field(ge=0)
    state: Literal["monitoring", "containing", "contained"]
    label: str = Field(min_length=3)
    detail: str = Field(min_length=10)


class DemoScenario(_Strict):
    slug: Slug
    title: str = Field(min_length=5, max_length=80)
    summary: str = Field(min_length=40, max_length=400)
    duration_seconds: int = Field(ge=30, le=300)
    start_clock: str = Field(description="Wall-clock time the scenario starts, HH:MM:SS")
    host: str = Field(description="The host the incident is about")
    user: str
    events: list[ScenarioEvent] = Field(min_length=6)
    notes: list[DemoNote] = Field(default_factory=list)
    containment: list[DemoContainment] = Field(min_length=2)

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str) -> str:
        if not SLUG_RE.match(v):
            raise ValueError("slug must be lowercase kebab-case")
        return v

    @field_validator("start_clock")
    @classmethod
    def _clock(cls, v: str) -> str:
        if not _CLOCK.match(v):
            raise ValueError("start_clock must be HH:MM:SS")
        return v
