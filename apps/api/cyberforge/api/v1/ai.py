"""Optional AI SOC analyst and the AI security overview."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import joinedload, selectinload

from cyberforge.ai import analyst
from cyberforge.ai.providers import ProviderError, provider_status
from cyberforge.api.deps import BundleDep, SessionDep, SettingsDep
from cyberforge.models import AIAnalysis, Alert, Lab
from cyberforge.schemas.misc import (
    AIFinding,
    AISecurityOverview,
    AIStatus,
    AnalyzeRequest,
    AnalyzeResponse,
    TrustBoundary,
)
from cyberforge.schemas.soc import AIAnalysisOut, AlertSummary

router = APIRouter(tags=["ai"])

SAFETY_NOTES = [
    "Opt-in: nothing is sent to a provider unless you click Analyze on an alert.",
    "Advisory only: suggestions are never executed and AI cannot run commands.",
    "Text only: no tools or functions are offered to the model.",
    "Use the Ollama provider to keep telemetry on your machine.",
]


@router.get("/ai/status", response_model=AIStatus, summary="Is AI analysis available?")
def ai_status(settings: SettingsDep) -> AIStatus:
    provider, reason = provider_status(settings)
    return AIStatus(
        enabled=provider is not None,
        provider=settings.ai_provider,
        model=settings.ai_model if provider else None,
        reason=reason,
        safety=SAFETY_NOTES,
    )


@router.post(
    "/ai/analyze-alert",
    response_model=AnalyzeResponse,
    summary="Analyze an alert with AI (optional)",
)
def analyze_alert(
    body: AnalyzeRequest, session: SessionDep, settings: SettingsDep
) -> AnalyzeResponse:
    alert = session.scalar(
        select(Alert)
        .where(Alert.id == body.alert_id)
        .options(selectinload(Alert.events), joinedload(Alert.rule), joinedload(Alert.technique))
    )
    if alert is None:
        raise HTTPException(404, "Alert not found")
    provider, reason = provider_status(settings)
    if provider is None:
        return AnalyzeResponse(
            available=False,
            provider=settings.ai_provider,
            model=None,
            disclaimer=analyst.DISCLAIMER,
            reason=reason,
        )
    try:
        content = analyst.analyze(provider, alert)
    except (ProviderError, analyst.AnalysisFailed) as exc:
        return AnalyzeResponse(
            available=False,
            provider=provider.name,
            model=provider.model,
            disclaimer=analyst.DISCLAIMER,
            reason=str(exc),
        )
    record = AIAnalysis(
        alert_id=alert.id,
        provider=provider.name,
        model=provider.model,
        content=content.model_dump(),
    )
    session.add(record)
    session.flush()
    return AnalyzeResponse(
        available=True,
        provider=provider.name,
        model=provider.model,
        disclaimer=analyst.DISCLAIMER,
        analysis=content,
        analysis_id=record.id,
        created_at=record.created_at,
    )


@router.get(
    "/ai/analyses", response_model=list[AIAnalysisOut], summary="Stored AI analyses for an alert"
)
def list_analyses(session: SessionDep, alert_id: Annotated[int, Query()]) -> list[AIAnalysis]:
    return list(
        session.scalars(
            select(AIAnalysis)
            .where(AIAnalysis.alert_id == alert_id)
            .order_by(AIAnalysis.created_at.desc())
            .limit(10)
        )
    )


# --- AI security section ------------------------------------------------------------------------


def _boundary_for(slug: str, boundaries: list[dict]) -> dict | None:
    return next((b for b in boundaries if slug in b.get("rules", [])), None)


@router.get(
    "/ai-security/overview",
    response_model=AISecurityOverview,
    summary="Trust-boundary model, topics and labs",
)
def ai_security_overview(session: SessionDep, bundle: BundleDep) -> AISecurityOverview:
    data = bundle.ai_security
    labs = session.scalars(
        select(Lab).where(Lab.domain == "ai-security").order_by(Lab.number)
    ).all()
    count = len(_ai_alerts(session))
    return AISecurityOverview(
        nodes=[{k: str(v) for k, v in n.items()} for n in data.get("nodes", [])],
        boundaries=[
            TrustBoundary(
                id=b["id"],
                from_node=b["from"],
                to_node=b["to"],
                title=b["title"],
                description=b["description"],
                failure_modes=b["failure_modes"],
                controls=b["controls"],
                rules=b["rules"],
            )
            for b in data.get("boundaries", [])
        ],
        topics=data.get("topics", []),
        labs=[
            {
                "slug": lab.slug,
                "title": lab.title,
                "difficulty": lab.difficulty,
                "duration_minutes": lab.duration_minutes,
                "summary": lab.summary,
                "number": lab.number,
            }
            for lab in labs
        ],
        finding_count=count,
    )


def _ai_alerts(session: SessionDep) -> list[Alert]:
    from cyberforge.models import MitreTechnique

    return list(
        session.scalars(
            select(Alert)
            .where(
                Alert.technique_id.in_(
                    select(MitreTechnique.id).where(MitreTechnique.framework == "atlas")
                )
            )
            .options(
                joinedload(Alert.rule), joinedload(Alert.technique), joinedload(Alert.assignee)
            )
            .order_by(Alert.timestamp.desc())
        ).unique()
    )


@router.get(
    "/ai-security/findings",
    response_model=list[AIFinding],
    summary="Findings from AI-agent telemetry",
)
def ai_findings(session: SessionDep, bundle: BundleDep) -> list[AIFinding]:
    boundaries = bundle.ai_security.get("boundaries", [])
    findings = []
    for alert in _ai_alerts(session):
        boundary = _boundary_for(alert.rule.slug, boundaries) if alert.rule else None
        findings.append(
            AIFinding(
                alert=AlertSummary.model_validate(alert),
                boundary_id=boundary["id"] if boundary else None,
                boundary_title=boundary["title"] if boundary else None,
                what_failed=boundary["failure_modes"][0] if boundary else "See the alert evidence.",
                control=boundary["controls"][0]
                if boundary
                else "Review the rule's mitigation guidance.",
            )
        )
    return findings
