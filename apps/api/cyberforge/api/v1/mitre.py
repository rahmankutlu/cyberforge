"""MITRE ATT&CK / ATLAS explorer."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from cyberforge.api.deps import BundleDep, SessionDep
from cyberforge.models import Alert, DetectionRule, Lab, MitreTactic, MitreTechnique
from cyberforge.schemas.common import LabRef, RuleRef, TacticOut
from cyberforge.schemas.misc import MatrixColumn, MatrixResponse, TechniqueCoverage, TechniqueDetail
from cyberforge.schemas.soc import AlertSummary
from cyberforge.services import coverage as coverage_service

router = APIRouter(tags=["mitre"])


def _coverage_item(tech: MitreTechnique, cov: coverage_service.Coverage) -> TechniqueCoverage:
    return TechniqueCoverage(
        id=tech.id, name=tech.name, framework=tech.framework, is_subtechnique=tech.is_subtechnique,
        parent_id=tech.parent_id, tactic_ids=[t.id for t in tech.tactics], labs=len(cov.labs), rules=len(cov.rules),
        alerts=len(cov.alerts), investigations=len(cov.investigations),
    )  # fmt: skip


@router.get("/mitre/tactics", response_model=list[TacticOut], summary="List tactics")
def list_tactics(
    session: SessionDep, framework: Annotated[str, Query(pattern="^(attack|atlas)$")] = "attack"
) -> list[MitreTactic]:
    return list(
        session.scalars(
            select(MitreTactic)
            .where(MitreTactic.framework == framework)
            .order_by(MitreTactic.position)
        )
    )


@router.get(
    "/mitre/techniques",
    response_model=list[TechniqueCoverage],
    summary="List techniques with coverage counts",
)
def list_techniques(
    session: SessionDep,
    framework: Annotated[str, Query(pattern="^(attack|atlas)$")] = "attack",
    tactic: Annotated[str | None, Query(max_length=32)] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    covered: bool | None = None,
) -> list[TechniqueCoverage]:
    techniques = (
        session.scalars(
            select(MitreTechnique)
            .where(MitreTechnique.framework == framework)
            .options(selectinload(MitreTechnique.tactics))
            .order_by(MitreTechnique.id)
        )
        .unique()
        .all()
    )
    cov = coverage_service.compute(session)
    out = []
    for t in techniques:
        if tactic and tactic not in [x.id for x in t.tactics]:
            continue
        if q and q.lower() not in f"{t.id} {t.name}".lower():
            continue
        item = _coverage_item(t, cov[t.id])
        if covered is not None and (item.rules > 0) != covered:
            continue
        out.append(item)
    return out


@router.get(
    "/mitre/matrix", response_model=MatrixResponse, summary="Coverage matrix (tactic columns)"
)
def matrix(
    session: SessionDep,
    bundle: BundleDep,
    framework: Annotated[str, Query(pattern="^(attack|atlas)$")] = "attack",
) -> MatrixResponse:
    tactics = session.scalars(
        select(MitreTactic).where(MitreTactic.framework == framework).order_by(MitreTactic.position)
    ).all()
    techniques = (
        session.scalars(
            select(MitreTechnique)
            .where(MitreTechnique.framework == framework)
            .options(selectinload(MitreTechnique.tactics))
            .order_by(MitreTechnique.id)
        )
        .unique()
        .all()
    )
    cov = coverage_service.compute(session)
    columns = []
    for tactic in tactics:
        members = [t for t in techniques if any(x.id == tactic.id for x in t.tactics)]
        columns.append(
            MatrixColumn(
                tactic=TacticOut.model_validate(tactic),
                techniques=[_coverage_item(t, cov[t.id]) for t in members],
            )
        )
    top = [t for t in techniques if not t.is_subtechnique]
    return MatrixResponse(
        framework=framework,
        version=bundle.mitre_versions.get(framework, ""),
        notice="ATT&CK is a registered trademark of The MITRE Corporation."
        if framework == "attack"
        else "MITRE ATLAS is a trademark of The MITRE Corporation.",
        columns=columns,
        totals={
            "techniques": len(top),
            "covered": sum(1 for t in top if cov[t.id].rules),
            "with_labs": sum(1 for t in top if cov[t.id].labs),
            "with_alerts": sum(1 for t in top if cov[t.id].alerts),
        },
    )


@router.get(
    "/mitre/techniques/{technique_id}", response_model=TechniqueDetail, summary="Technique detail"
)
def get_technique(technique_id: str, session: SessionDep) -> TechniqueDetail:
    tech = session.scalar(
        select(MitreTechnique)
        .where(MitreTechnique.id == technique_id.upper())
        .options(selectinload(MitreTechnique.tactics))
    )
    if tech is None:
        raise HTTPException(404, "Technique not found")
    cov = coverage_service.compute(session)
    children = (
        session.scalars(
            select(MitreTechnique)
            .where(MitreTechnique.parent_id == tech.id)
            .options(selectinload(MitreTechnique.tactics))
            .order_by(MitreTechnique.id)
        )
        .unique()
        .all()
    )
    c = cov[tech.id]
    labs = (
        session.scalars(select(Lab).where(Lab.id.in_(c.labs)).order_by(Lab.number)).all()
        if c.labs
        else []
    )
    rules = (
        session.scalars(
            select(DetectionRule).where(DetectionRule.id.in_(c.rules)).order_by(DetectionRule.title)
        ).all()
        if c.rules
        else []
    )
    alerts = (
        session.scalars(
            select(Alert)
            .where(Alert.id.in_(c.alerts))
            .options(
                joinedload(Alert.rule), joinedload(Alert.technique), joinedload(Alert.assignee)
            )
            .order_by(Alert.timestamp.desc())
            .limit(8)
        )
        .unique()
        .all()
        if c.alerts
        else []
    )
    base = _coverage_item(tech, c)
    return TechniqueDetail(
        **base.model_dump(), description=tech.description, url=tech.url, platforms=tech.platforms, mitigations=tech.mitigations,
        tactics=[TacticOut.model_validate(t) for t in tech.tactics], lab_refs=[LabRef.model_validate(x) for x in labs],
        rule_refs=[RuleRef.model_validate(r) for r in rules], recent_alerts=[AlertSummary.model_validate(a) for a in alerts],
        sub_techniques=[_coverage_item(ch, cov[ch.id]) for ch in children],
    )  # fmt: skip
