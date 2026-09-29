"""Threat intelligence indicators (seeded or manually imported; never auto-enriched)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from cyberforge.db import Base, utcnow


class Indicator(Base):
    __tablename__ = "indicators"
    __table_args__ = (UniqueConstraint("type", "value", name="uq_indicator_type_value"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    type: Mapped[str] = mapped_column(String(16), index=True)  # ip|domain|url|sha256|email|cve|asn
    value: Mapped[str] = mapped_column(String(512), index=True)
    tags: Mapped[list[str]] = mapped_column(default=list)
    confidence: Mapped[int] = mapped_column(Integer, default=50)
    source: Mapped[str] = mapped_column(String(128), default="manual")
    tlp: Mapped[str] = mapped_column(String(16), default="clear")
    first_seen: Mapped[datetime] = mapped_column(default=utcnow)
    last_seen: Mapped[datetime] = mapped_column(default=utcnow)
    notes: Mapped[str] = mapped_column(Text, default="")
    synthetic: Mapped[bool] = mapped_column(default=True)
