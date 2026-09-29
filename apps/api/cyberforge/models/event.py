"""Normalized security events (synthetic or lab-generated)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from cyberforge.db import Base


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (Index("ix_events_ts_cat", "timestamp", "category"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(index=True)
    source: Mapped[str] = mapped_column(String(48), index=True)  # sysmon, linux-auth, dns, ...
    category: Mapped[str] = mapped_column(String(48), index=True)
    logsource: Mapped[dict[str, Any]] = mapped_column(default=dict)  # Sigma logsource of the event
    host: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    user: Mapped[str | None] = mapped_column(String(128), index=True, nullable=True)
    action: Mapped[str | None] = mapped_column(String(96), nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(24), nullable=True)
    src_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dst_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    dst_port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    process: Mapped[str | None] = mapped_column(String(512), nullable=True)
    parent_process: Mapped[str | None] = mapped_column(String(512), nullable=True)
    command_line: Mapped[str | None] = mapped_column(Text, nullable=True)
    message: Mapped[str] = mapped_column(Text, default="")
    raw: Mapped[str] = mapped_column(Text, default="")
    fields: Mapped[dict[str, Any]] = mapped_column(default=dict)  # Sigma-style field map
    note: Mapped[str | None] = mapped_column(Text, nullable=True)  # lab narration, if any
    synthetic: Mapped[bool] = mapped_column(default=True)
    dataset: Mapped[str | None] = mapped_column(String(96), nullable=True)
    lab_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("lab_runs.id", ondelete="SET NULL"), nullable=True, index=True
    )
