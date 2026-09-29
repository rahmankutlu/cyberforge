"""Mini SOC: analysts, alerts, investigations, notes, reports, AI analyses."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cyberforge.db import Base, utcnow
from cyberforge.models.detection import DetectionRule
from cyberforge.models.event import Event
from cyberforge.models.mitre import MitreTechnique

alert_events = Table(
    "alert_events",
    Base.metadata,
    Column("alert_id", ForeignKey("alerts.id", ondelete="CASCADE"), primary_key=True),
    Column("event_id", ForeignKey("events.id", ondelete="CASCADE"), primary_key=True),
)


class Analyst(Base):
    __tablename__ = "analysts"

    id: Mapped[int] = mapped_column(primary_key=True)
    handle: Mapped[str] = mapped_column(String(48), unique=True)
    name: Mapped[str] = mapped_column(String(96))
    role: Mapped[str] = mapped_column(String(64))


class Investigation(Base):
    __tablename__ = "investigations"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(24), default="open", index=True)
    severity: Mapped[str] = mapped_column(String(16), default="medium")
    lead_id: Mapped[int | None] = mapped_column(ForeignKey("analysts.id"), nullable=True)
    lab_slug: Mapped[str | None] = mapped_column(String(96), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)
    synthetic: Mapped[bool] = mapped_column(default=True)

    lead: Mapped[Analyst | None] = relationship()
    alerts: Mapped[list[Alert]] = relationship(back_populates="investigation")
    notes: Mapped[list[InvestigationNote]] = relationship(
        back_populates="investigation",
        order_by="InvestigationNote.created_at",
        cascade="all, delete-orphan",
    )
    timeline: Mapped[list[TimelineEntry]] = relationship(
        back_populates="investigation",
        order_by="TimelineEntry.timestamp",
        cascade="all, delete-orphan",
    )
    report: Mapped[IncidentReport | None] = relationship(
        back_populates="investigation", uselist=False, cascade="all, delete-orphan"
    )


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    severity: Mapped[str] = mapped_column(String(16), index=True)
    status: Mapped[str] = mapped_column(String(24), default="new", index=True)
    source: Mapped[str] = mapped_column(String(64))
    timestamp: Mapped[datetime] = mapped_column(index=True)
    host: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    user: Mapped[str | None] = mapped_column(String(128), nullable=True)
    rule_id: Mapped[int | None] = mapped_column(
        ForeignKey("detection_rules.id", ondelete="SET NULL"), nullable=True, index=True
    )
    technique_id: Mapped[str | None] = mapped_column(
        ForeignKey("mitre_techniques.id", ondelete="SET NULL"), nullable=True, index=True
    )
    tactic: Mapped[str | None] = mapped_column(String(96), nullable=True)
    confidence: Mapped[int] = mapped_column(Integer, default=70)
    evidence: Mapped[dict[str, Any]] = mapped_column(default=dict)
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("analysts.id"), nullable=True)
    lab_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("lab_runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
    investigation_id: Mapped[int | None] = mapped_column(
        ForeignKey("investigations.id", ondelete="SET NULL"), nullable=True, index=True
    )
    dedup_key: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    synthetic: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    rule: Mapped[DetectionRule | None] = relationship()
    technique: Mapped[MitreTechnique | None] = relationship()
    assignee: Mapped[Analyst | None] = relationship()
    investigation: Mapped[Investigation | None] = relationship(back_populates="alerts")
    events: Mapped[list[Event]] = relationship(secondary=alert_events, order_by=Event.timestamp)


class InvestigationNote(Base):
    """Analyst note attached to an alert, an investigation, or both."""

    __tablename__ = "investigation_notes"
    __table_args__ = (
        CheckConstraint(
            "alert_id IS NOT NULL OR investigation_id IS NOT NULL", name="ck_note_has_parent"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    investigation_id: Mapped[int | None] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"), nullable=True, index=True
    )
    alert_id: Mapped[int | None] = mapped_column(
        ForeignKey("alerts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    author_id: Mapped[int | None] = mapped_column(ForeignKey("analysts.id"), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    author: Mapped[Analyst | None] = relationship()
    investigation: Mapped[Investigation | None] = relationship(back_populates="notes")


class TimelineEntry(Base):
    __tablename__ = "investigation_timeline"

    id: Mapped[int] = mapped_column(primary_key=True)
    investigation_id: Mapped[int] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"), index=True
    )
    timestamp: Mapped[datetime] = mapped_column()
    kind: Mapped[str] = mapped_column(
        String(24)
    )  # detection | evidence | containment | note | status
    title: Mapped[str] = mapped_column(String(200))
    detail: Mapped[str] = mapped_column(Text, default="")
    alert_id: Mapped[int | None] = mapped_column(
        ForeignKey("alerts.id", ondelete="SET NULL"), nullable=True
    )

    investigation: Mapped[Investigation] = relationship(back_populates="timeline")


class IncidentReport(Base):
    __tablename__ = "incident_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    investigation_id: Mapped[int] = mapped_column(
        ForeignKey("investigations.id", ondelete="CASCADE"), unique=True
    )
    status: Mapped[str] = mapped_column(String(16), default="draft")
    executive_summary: Mapped[str] = mapped_column(Text, default="")
    timeline: Mapped[list[dict[str, Any]]] = mapped_column(default=list)
    affected_assets: Mapped[list[str]] = mapped_column(default=list)
    indicators: Mapped[list[str]] = mapped_column(default=list)
    mitre_techniques: Mapped[list[str]] = mapped_column(default=list)
    evidence: Mapped[str] = mapped_column(Text, default="")
    root_cause: Mapped[str] = mapped_column(Text, default="")
    containment: Mapped[str] = mapped_column(Text, default="")
    remediation: Mapped[str] = mapped_column(Text, default="")
    lessons_learned: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    investigation: Mapped[Investigation] = relationship(back_populates="report")


class AIAnalysis(Base):
    """Stored AI-generated analysis. Always advisory; never executed."""

    __tablename__ = "ai_analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    alert_id: Mapped[int] = mapped_column(ForeignKey("alerts.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(96), default="")
    content: Mapped[dict[str, Any]] = mapped_column(default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
