"""MITRE coverage: how many labs, rules, alerts and investigations map to each technique.

Sub-technique counts roll up into their parent so the matrix can show a parent's coverage as the
union of everything beneath it.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from cyberforge.models import (
    Alert,
    DetectionRule,
    MitreTechnique,
    lab_techniques,
    rule_techniques,
)


@dataclass
class Coverage:
    labs: set[int] = field(default_factory=set)
    rules: set[int] = field(default_factory=set)
    alerts: set[int] = field(default_factory=set)
    investigations: set[int] = field(default_factory=set)

    def merge(self, other: Coverage) -> None:
        self.labs |= other.labs
        self.rules |= other.rules
        self.alerts |= other.alerts
        self.investigations |= other.investigations


def compute(session: Session) -> dict[str, Coverage]:
    cov: dict[str, Coverage] = defaultdict(Coverage)
    for tech_id, lab_id in session.execute(
        select(lab_techniques.c.technique_id, lab_techniques.c.lab_id)
    ):
        cov[tech_id].labs.add(lab_id)
    rule_rows = session.execute(
        select(rule_techniques.c.technique_id, rule_techniques.c.rule_id)
        .join(DetectionRule, DetectionRule.id == rule_techniques.c.rule_id)
        .where(DetectionRule.enabled.is_(True))
    )
    for tech_id, rule_id in rule_rows:
        cov[tech_id].rules.add(rule_id)
    for alert_id, tech_id, inv_id in session.execute(
        select(Alert.id, Alert.technique_id, Alert.investigation_id).where(
            Alert.technique_id.is_not(None)
        )
    ):
        if tech_id is None:
            continue
        cov[tech_id].alerts.add(alert_id)
        if inv_id:
            cov[tech_id].investigations.add(inv_id)

    parents: dict[str, str | None] = dict(
        session.execute(select(MitreTechnique.id, MitreTechnique.parent_id)).tuples().all()
    )
    rolled: dict[str, Coverage] = {tid: Coverage() for tid in parents}
    for tech_id, c in cov.items():
        if tech_id in rolled:
            rolled[tech_id].merge(c)
        parent = parents.get(tech_id)
        if parent and parent in rolled:
            rolled[parent].merge(c)
    return rolled
