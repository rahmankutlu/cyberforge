"""Detection content: Sigma, YARA and Suricata rules."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Column, ForeignKey, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cyberforge.db import Base, utcnow

rule_techniques = Table(
    "rule_techniques",
    Base.metadata,
    Column("rule_id", ForeignKey("detection_rules.id", ondelete="CASCADE"), primary_key=True),
    Column("technique_id", ForeignKey("mitre_techniques.id", ondelete="CASCADE"), primary_key=True),
)


class DetectionRule(Base):
    __tablename__ = "detection_rules"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    format: Mapped[str] = mapped_column(String(16), index=True)  # sigma | yara | suricata
    status: Mapped[str] = mapped_column(String(16), default="stable")
    level: Mapped[str] = mapped_column(String(16), default="medium", index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    content: Mapped[str] = mapped_column(Text)
    logsource: Mapped[dict[str, Any]] = mapped_column(default=dict)
    tags: Mapped[list[str]] = mapped_column(default=list)
    false_positives: Mapped[list[str]] = mapped_column(default=list)
    references: Mapped[list[str]] = mapped_column(default=list)
    author: Mapped[str] = mapped_column(String(128), default="CyberForge")
    enabled: Mapped[bool] = mapped_column(default=True)
    is_correlation: Mapped[bool] = mapped_column(default=False)
    origin: Mapped[str] = mapped_column(String(16), default="builtin")  # builtin | user
    source_path: Mapped[str] = mapped_column(String(256), default="")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    techniques = relationship(
        "MitreTechnique", secondary=rule_techniques, order_by="MitreTechnique.id"
    )
