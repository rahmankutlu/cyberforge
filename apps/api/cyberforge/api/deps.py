"""Shared FastAPI dependencies and query helpers."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from cyberforge.config import Settings, get_settings
from cyberforge.content.loader import ContentBundle
from cyberforge.db import get_session

# scope="function" commits before the response is sent, so a client that reads right after a write
# never races the commit (the default "request" scope runs the commit after the response).
SessionDep = Annotated[Session, Depends(get_session, scope="function")]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_bundle(request: Request) -> ContentBundle:
    bundle = getattr(request.app.state, "bundle", None)
    if bundle is None:
        raise HTTPException(status_code=503, detail="Content not loaded yet")
    return bundle


BundleDep = Annotated[ContentBundle, Depends(get_bundle)]


def detection_health(request: Request, bundle: BundleDep) -> tuple[Any, list[Any]]:
    """Rule test results and quality checks for the loaded content.

    Content is read-only while the API runs, so this is computed once per process.
    """
    from cyberforge.services import rule_quality, rule_tests

    cached = getattr(request.app.state, "detection_health", None)
    if cached is None:
        summary = rule_tests.run_all(bundle)
        cached = (summary, rule_quality.evaluate_all(bundle, summary))
        request.app.state.detection_health = cached
    return cached


def content_coverage(request: Request, bundle: BundleDep) -> dict[str, Any]:
    """Story, test and domain coverage per MITRE technique (see services.content_coverage)."""
    from cyberforge.services import content_coverage as cc

    cached = getattr(request.app.state, "content_coverage", None)
    if cached is None:
        summary, _ = detection_health(request, bundle)
        cached = cc.compute(bundle, summary)
        request.app.state.content_coverage = cached
    return cached


class PageParams:
    def __init__(
        self,
        page: Annotated[int, Query(ge=1, le=10_000)] = 1,
        page_size: Annotated[int, Query(ge=1, le=200)] = 25,
    ):
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


PageDep = Annotated[PageParams, Depends()]


def escape_like(value: str) -> str:
    """Escape LIKE wildcards so user text is matched literally (use with escape='\\')."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
