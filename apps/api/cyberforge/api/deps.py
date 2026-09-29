"""Shared FastAPI dependencies and query helpers."""

from __future__ import annotations

from typing import Annotated

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
