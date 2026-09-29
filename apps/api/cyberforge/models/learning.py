"""Learning tracks, modules and locally-synced progress."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from cyberforge.db import Base, utcnow


class LearningModule(Base):
    __tablename__ = "learning_modules"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(96), unique=True, index=True)
    track: Mapped[str] = mapped_column(String(64), index=True)  # track slug, or "30-days"
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(Text, default="")
    body: Mapped[str] = mapped_column(Text, default="")
    duration_minutes: Mapped[int] = mapped_column(Integer, default=15)
    day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lab_slugs: Mapped[list[str]] = mapped_column(default=list)
    rule_slugs: Mapped[list[str]] = mapped_column(default=list)
    technique_ids: Mapped[list[str]] = mapped_column(default=list)


class LearningProgress(Base):
    __tablename__ = "learning_progress"
    __table_args__ = (UniqueConstraint("profile_id", "module_slug", name="uq_progress"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    profile_id: Mapped[str] = mapped_column(String(64), index=True)  # anonymous, browser-generated
    module_slug: Mapped[str] = mapped_column(String(96))
    completed_at: Mapped[datetime] = mapped_column(default=utcnow)
