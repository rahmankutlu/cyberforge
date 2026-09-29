"""Learning tracks, the 30-day plan and anonymous progress sync."""

from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException
from sqlalchemy import delete, select

from cyberforge.api.deps import BundleDep, SessionDep
from cyberforge.db import utcnow
from cyberforge.models import LearningModule, LearningProgress
from cyberforge.schemas.misc import (
    LearningOverview,
    ModuleDetail,
    ModuleSummary,
    ProgressOut,
    ProgressUpdate,
    TrackOut,
)

router = APIRouter(tags=["learning"])
_PROFILE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


@router.get("/learning", response_model=LearningOverview, summary="Tracks and the 30-day plan")
def overview(session: SessionDep, bundle: BundleDep) -> LearningOverview:
    modules = session.scalars(
        select(LearningModule).order_by(LearningModule.track, LearningModule.position)
    ).all()
    by_track: dict[str, list[ModuleSummary]] = {}
    for m in modules:
        by_track.setdefault(m.track, []).append(ModuleSummary.model_validate(m))

    def track_out(slug: str, title: str, audience: str, summary: str, icon: str) -> TrackOut:
        mods = by_track.get(slug, [])
        return TrackOut(
            slug=slug,
            title=title,
            audience=audience,
            summary=summary,
            icon=icon,
            modules=mods,
            total_minutes=sum(m.duration_minutes for m in mods),
        )

    tracks = [track_out(t.slug, t.title, t.audience, t.summary, t.icon) for t in bundle.tracks]
    plan = bundle.thirty_days
    return LearningOverview(
        tracks=tracks,
        thirty_days=track_out("30-days", plan.title, "Everyone", plan.summary, "calendar")
        if plan
        else None,
    )


@router.get(
    "/learning/modules/{slug}", response_model=ModuleDetail, summary="A module with its lesson body"
)
def get_module(slug: str, session: SessionDep) -> LearningModule:
    module = session.scalar(select(LearningModule).where(LearningModule.slug == slug))
    if module is None:
        raise HTTPException(404, "Module not found")
    return module


@router.get(
    "/learning/progress/{profile_id}",
    response_model=ProgressOut,
    summary="Progress for an anonymous local profile",
)
def get_progress(profile_id: str, session: SessionDep) -> ProgressOut:
    _check(profile_id)
    done = list(
        session.scalars(
            select(LearningProgress.module_slug).where(LearningProgress.profile_id == profile_id)
        )
    )
    return ProgressOut(profile_id=profile_id, completed=sorted(done))


@router.put(
    "/learning/progress/{profile_id}",
    response_model=ProgressOut,
    summary="Replace the completed set",
)
def put_progress(profile_id: str, body: ProgressUpdate, session: SessionDep) -> ProgressOut:
    """Optional backup of browser-local progress to this CyberForge instance. No account involved."""
    _check(profile_id)
    valid = set(session.scalars(select(LearningModule.slug)))
    wanted = sorted({s for s in body.completed if s in valid})
    session.execute(delete(LearningProgress).where(LearningProgress.profile_id == profile_id))
    session.add_all(
        [
            LearningProgress(profile_id=profile_id, module_slug=s, completed_at=utcnow())
            for s in wanted
        ]
    )
    return ProgressOut(profile_id=profile_id, completed=wanted)


def _check(profile_id: str) -> None:
    if not _PROFILE.match(profile_id):
        raise HTTPException(422, "profile_id must be 8-64 characters of letters, digits, - or _")
