"""Cyber range labs and their runs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Column, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cyberforge.db import Base, utcnow

lab_techniques = Table(
    "lab_techniques",
    Base.metadata,
    Column("lab_id", ForeignKey("labs.id", ondelete="CASCADE"), primary_key=True),
    Column("technique_id", ForeignKey("mitre_techniques.id", ondelete="CASCADE"), primary_key=True),
)

lab_rules = Table(
    "lab_rules",
    Base.metadata,
    Column("lab_id", ForeignKey("labs.id", ondelete="CASCADE"), primary_key=True),
    Column("rule_id", ForeignKey("detection_rules.id", ondelete="CASCADE"), primary_key=True),
)


class Lab(Base):
    __tablename__ = "labs"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(96), unique=True, index=True)
    number: Mapped[int] = mapped_column(Integer, index=True)
    title: Mapped[str] = mapped_column(String(160))
    difficulty: Mapped[str] = mapped_column(String(16), index=True)
    category: Mapped[str] = mapped_column(String(64), index=True)
    domain: Mapped[str] = mapped_column(String(32), index=True)  # web | api | linux | ...
    duration_minutes: Mapped[int] = mapped_column(Integer)
    summary: Mapped[str] = mapped_column(Text)
    document: Mapped[dict[str, Any]] = mapped_column(default=dict)  # full lab.yaml content
    scenario_events: Mapped[list[dict[str, Any]]] = mapped_column(default=list)
    source_path: Mapped[str] = mapped_column(String(256), default="")

    techniques = relationship(
        "MitreTechnique", secondary=lab_techniques, order_by="MitreTechnique.id"
    )
    rules = relationship("DetectionRule", secondary=lab_rules, order_by="DetectionRule.slug")


class LabRun(Base):
    __tablename__ = "lab_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    lab_id: Mapped[int] = mapped_column(ForeignKey("labs.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(16), default="completed")
    mode: Mapped[str] = mapped_column(String(16), default="simulation")
    target: Mapped[str | None] = mapped_column(String(128), nullable=True)
    started_at: Mapped[datetime] = mapped_column(default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)
    events_generated: Mapped[int] = mapped_column(Integer, default=0)
    alerts_generated: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    synthetic: Mapped[bool] = mapped_column(default=True)

    lab: Mapped[Lab] = relationship()
