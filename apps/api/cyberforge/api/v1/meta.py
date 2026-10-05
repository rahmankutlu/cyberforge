"""Cross-cutting endpoints: dashboard, analysts, search, docs, demo mode, runtime settings."""

from __future__ import annotations

import random
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import String, cast, func, or_, select

from cyberforge import __version__
from cyberforge.ai.providers import provider_status
from cyberforge.api.deps import BundleDep, SessionDep, SettingsDep, escape_like
from cyberforge.models import (
    Alert,
    Analyst,
    DetectionRule,
    Event,
    Indicator,
    Investigation,
    Lab,
    LearningModule,
    MitreTechnique,
)
from cyberforge.schemas.common import AnalystOut, Message
from cyberforge.schemas.misc import (
    AIStatus,
    DashboardResponse,
    DocPageOut,
    DocSummary,
    RuntimeSettings,
    SearchHit,
    SearchResponse,
)
from cyberforge.services import dashboard as dashboard_service
from cyberforge.services import search as search_service
from cyberforge.services import seed
from cyberforge.services.labs import run_lab

router = APIRouter(tags=["platform"])


@router.get("/dashboard", response_model=DashboardResponse, summary="Dashboard aggregates")
def get_dashboard(session: SessionDep, settings: SettingsDep) -> DashboardResponse:
    return dashboard_service.build(session, settings)


@router.get("/analysts", response_model=list[AnalystOut], summary="Local demo analysts")
def list_analysts(session: SessionDep) -> list[Analyst]:
    return list(session.scalars(select(Analyst).order_by(Analyst.id)))


# --- search ---------------------------------------------------------------------------------------

PER_KIND = 5


@router.get("/search", response_model=SearchResponse, summary="Global search")
def search(
    session: SessionDep, bundle: BundleDep, q: Annotated[str, Query(min_length=1, max_length=100)]
) -> SearchResponse:
    needle = q.strip().lower()
    like = f"%{escape_like(needle)}%"
    hits: list[SearchHit] = []
    # What the query *means*: a technique id or tactic name finds everything mapped to it.
    meaning = search_service.search_content(bundle, needle)

    def contains(col):
        return func.lower(col).like(like, escape="\\")

    for lab in session.scalars(
        select(Lab)
        .where(
            or_(
                contains(Lab.title),
                contains(Lab.summary),
                contains(Lab.category),
                contains(Lab.domain),
                Lab.slug.in_(meaning.lab_slugs),
            )
        )
        .order_by(Lab.number)
        .limit(PER_KIND)
    ):
        hits.append(
            SearchHit(
                kind="lab",
                id=lab.slug,
                title=f"{lab.number:02d} {lab.title}",
                subtitle=f"{lab.domain} · {lab.difficulty}",
                href=f"/labs/{lab.slug}",
                badge=lab.difficulty,
            )
        )
    hits.extend(
        SearchHit(kind="story", id=h.id, title=h.title, subtitle=h.subtitle, href=h.href, badge=h.badge)
        for h in meaning.stories[:PER_KIND]
    )
    for rule in session.scalars(
        select(DetectionRule)
        .where(
            or_(
                contains(DetectionRule.title),
                contains(DetectionRule.slug),
                contains(DetectionRule.description),
                contains(cast(DetectionRule.logsource, String)),
                DetectionRule.slug.in_(meaning.rule_slugs),
                DetectionRule.format.in_(meaning.formats),
            )
        )
        .order_by(DetectionRule.title)
        .limit(PER_KIND)
    ):
        hits.append(
            SearchHit(
                kind="rule",
                id=rule.slug,
                title=rule.title,
                subtitle=f"{rule.format} · {rule.level}",
                href=f"/detections/{rule.slug}",
                badge=rule.format,
            )
        )
    hits.extend(
        SearchHit(kind="dataset", id=h.id, title=h.title, subtitle=h.subtitle, href=h.href, badge=h.badge)
        for h in meaning.datasets[:PER_KIND]
    )
    for tech in session.scalars(
        select(MitreTechnique)
        .where(
            or_(
                contains(MitreTechnique.id),
                contains(MitreTechnique.name),
                MitreTechnique.id.in_(meaning.technique_ids),
            )
        )
        .order_by(MitreTechnique.id)
        .limit(PER_KIND)
    ):
        hits.append(
            SearchHit(
                kind="technique",
                id=tech.id,
                title=f"{tech.id} {tech.name}",
                subtitle=tech.framework.upper(),
                href=f"/mitre/{tech.id}",
                badge=tech.framework,
            )
        )
    for alert in session.scalars(
        select(Alert)
        .where(or_(contains(Alert.title), contains(Alert.host), contains(Alert.user)))
        .order_by(Alert.timestamp.desc())
        .limit(PER_KIND)
    ):
        hits.append(
            SearchHit(
                kind="alert",
                id=str(alert.id),
                title=alert.title,
                subtitle=f"#{alert.id} · {alert.host or 'n/a'} · {alert.status}",
                href=f"/soc/alerts/{alert.id}",
                badge=alert.severity,
            )
        )
    for mod in session.scalars(
        select(LearningModule)
        .where(or_(contains(LearningModule.title), contains(LearningModule.summary)))
        .order_by(LearningModule.track, LearningModule.position)
        .limit(PER_KIND)
    ):
        hits.append(
            SearchHit(
                kind="learning",
                id=mod.slug,
                title=mod.title,
                subtitle=f"Learn · {mod.track}",
                href=f"/learn/{mod.track}/{mod.slug}",
            )
        )
    for ind in session.scalars(select(Indicator).where(contains(Indicator.value)).limit(PER_KIND)):
        hits.append(
            SearchHit(
                kind="indicator",
                id=str(ind.id),
                title=ind.value,
                subtitle=f"Indicator · {ind.type}",
                href=f"/threat-intel?q={ind.value}",
                badge=ind.type,
            )
        )
    for page in bundle.docs:
        if needle in page.title.lower() or needle in page.markdown.lower():
            hits.append(
                SearchHit(
                    kind="doc",
                    id=page.slug,
                    title=page.title,
                    subtitle="Documentation",
                    href=f"/docs/{page.slug}",
                )
            )
            if sum(h.kind == "doc" for h in hits) >= PER_KIND:
                break
    return SearchResponse(query=q, hits=hits)


# --- docs ----------------------------------------------------------------------------------------


@router.get("/docs-pages", response_model=list[DocSummary], summary="Documentation index")
def list_docs(bundle: BundleDep) -> list[DocSummary]:
    return [DocSummary(slug=d.slug, title=d.title, path=d.path) for d in bundle.docs]


@router.get(
    "/docs-pages/{slug}", response_model=DocPageOut, summary="A documentation page (Markdown)"
)
def get_doc(slug: str, bundle: BundleDep) -> DocPageOut:
    page = next((d for d in bundle.docs if d.slug == slug.lower()), None)
    if page is None:
        raise HTTPException(404, "Document not found")
    return DocPageOut(slug=page.slug, title=page.title, path=page.path, markdown=page.markdown)


# --- demo mode -----------------------------------------------------------------------------------


@router.post("/demo/generate", response_model=Message, summary="Generate fresh synthetic activity")
def demo_generate(
    session: SessionDep, settings: SettingsDep, count: Annotated[int, Query(ge=1, le=5)] = 2
) -> Message:
    """Runs a few random labs now so the dashboard shows new synthetic alerts."""
    if not settings.demo_mode:
        raise HTTPException(409, "Demo mode is disabled (CYBERFORGE_DEMO_MODE=false)")
    labs = list(session.scalars(select(Lab)))
    rng = random.Random()  # noqa: S311 - demo variety, not security
    picked = rng.sample(labs, min(count, len(labs)))
    alerts = 0
    for lab in picked:
        alerts += run_lab(session, lab, notes="Demo mode: generated on request.").alerts_generated
    return Message(detail=f"Generated {len(picked)} simulation(s) and {alerts} alert(s).")


@router.post("/demo/reset", response_model=Message, summary="Reset synthetic activity and reseed")
def demo_reset(session: SessionDep, settings: SettingsDep, bundle: BundleDep) -> Message:
    if not settings.demo_mode or settings.env == "production":
        raise HTTPException(409, "Reset is only available in demo mode outside production")
    seed.reset_demo(session)
    seed.seed_demo(session, bundle)
    return Message(detail="Synthetic activity was reset and reseeded.")


# --- runtime settings ------------------------------------------------------------------------------


@router.get(
    "/settings/runtime",
    response_model=RuntimeSettings,
    summary="Runtime configuration (no secrets)",
)
def runtime_settings(
    session: SessionDep, settings: SettingsDep, bundle: BundleDep
) -> RuntimeSettings:
    provider, reason = provider_status(settings)

    def count(model) -> int:
        return session.scalar(select(func.count()).select_from(model)) or 0

    return RuntimeSettings(
        version=__version__,
        env=settings.env,
        demo_mode=settings.demo_mode,
        ai=AIStatus(
            enabled=provider is not None,
            provider=settings.ai_provider,
            model=settings.ai_model if provider else None,
            reason=reason,
            safety=[],
        ),
        content={
            "mitre": bundle.mitre_versions,
            "labs": len(bundle.labs),
            "rules": len(bundle.rules),
            "docs": len(bundle.docs),
        },
        counts={
            "labs": count(Lab),
            "rules": count(DetectionRule),
            "events": count(Event),
            "alerts": count(Alert),
            "investigations": count(Investigation),
            "indicators": count(Indicator),
        },
        lab_network={
            "bind": "127.0.0.1",
            "network": "internal (no internet)",
            "ingest": "authenticated lab containers only",
        },
    )
