"""MITRE ATT&CK / ATLAS reference data."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from cyberforge.db import Base

technique_tactics = Table(
    "technique_tactics",
    Base.metadata,
    Column("technique_id", ForeignKey("mitre_techniques.id", ondelete="CASCADE"), primary_key=True),
    Column("tactic_id", ForeignKey("mitre_tactics.id", ondelete="CASCADE"), primary_key=True),
)


class MitreTactic(Base):
    __tablename__ = "mitre_tactics"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # e.g. TA0002
    framework: Mapped[str] = mapped_column(String(16), index=True)  # attack | atlas
    shortname: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(128))
    description: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str] = mapped_column(String(256), default="")
    position: Mapped[int] = mapped_column(Integer, default=0)

    techniques: Mapped[list[MitreTechnique]] = relationship(
        secondary=technique_tactics, back_populates="tactics"
    )


class MitreTechnique(Base):
    __tablename__ = "mitre_techniques"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # e.g. T1059.001
    framework: Mapped[str] = mapped_column(String(16), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    url: Mapped[str] = mapped_column(String(256), default="")
    is_subtechnique: Mapped[bool] = mapped_column(Boolean, default=False)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("mitre_techniques.id", ondelete="SET NULL"), nullable=True, index=True
    )
    platforms: Mapped[list[str]] = mapped_column(default=list)
    mitigations: Mapped[list[dict[str, Any]]] = mapped_column(default=list)

    tactics: Mapped[list[MitreTactic]] = relationship(
        secondary=technique_tactics, back_populates="techniques", order_by=MitreTactic.position
    )
