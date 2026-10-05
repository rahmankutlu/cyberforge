"""Attack stories: complete attack-and-defence narratives served from repository files."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Request

from cyberforge.api.deps import BundleDep
from cyberforge.services import stories as story_service

router = APIRouter(prefix="/stories", tags=["stories"])


def _views(request: Request, bundle: BundleDep) -> dict[str, dict[str, Any]]:
    """Story views need the detection engine, so build them once per process (content is static)."""
    cached = getattr(request.app.state, "story_views", None)
    if cached is None:
        cached = {s.slug: story_service.build_view(s, bundle) for s in bundle.stories}
        request.app.state.story_views = cached
    return cached


@router.get("", summary="List attack stories")
def list_stories(bundle: BundleDep) -> list[dict[str, Any]]:
    return [story_service.summary(s) for s in sorted(bundle.stories, key=lambda s: (s.order, s.title))]


@router.get("/{slug}", summary="A complete story: timeline, evidence, detections and questions")
def get_story(
    slug: Annotated[str, Path(max_length=96)], request: Request, bundle: BundleDep
) -> dict[str, Any]:
    views = _views(request, bundle)
    if slug not in views:
        raise HTTPException(404, "Story not found")
    return views[slug]
