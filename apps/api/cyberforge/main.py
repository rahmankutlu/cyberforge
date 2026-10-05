"""FastAPI application factory."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from cyberforge import __version__
from cyberforge.api.v1.router import api_router
from cyberforge.config import Settings, get_settings
from cyberforge.content.loader import ContentBundle, ContentError, load_bundle
from cyberforge.db import get_engine, session_factory
from cyberforge.migrations import upgrade_to_head
from cyberforge.security import RateLimiter, SecurityMiddleware
from cyberforge.services import seed

log = logging.getLogger("cyberforge")

DESCRIPTION = """
**CyberForge** is The Open Cybersecurity Lab: a cyber range, mini SOC, detection engineering,
MITRE ATT&CK mapping and AI security in one local-first platform.

* All telemetry is **synthetic** or comes from isolated local lab containers.
* Simulations replay telemetry only; nothing is ever sent to external systems.
* AI analysis is **optional** and advisory.

Source: https://github.com/rahmankutlu/cyberforge

Created and maintained by Abdurrahman Kutlu (https://rahmankutlu.com).
"""

TAGS = [
    {"name": "labs", "description": "Cyber range labs and safe simulations."},
    {"name": "events", "description": "Normalised telemetry, plus lab-container ingestion."},
    {"name": "alerts", "description": "SOC alerts, notes and the attack-to-detection lifecycle."},
    {"name": "investigations", "description": "Investigations, timelines and incident reports."},
    {
        "name": "detections",
        "description": "Sigma / YARA / Suricata rules, validation, translation and testing.",
    },
    {"name": "mitre", "description": "MITRE ATT&CK and ATLAS explorer with coverage."},
    {"name": "threat-intel", "description": "Local indicator workspace (no external enrichment)."},
    {"name": "learning", "description": "Learning tracks and the 30-day plan."},
    {"name": "ai", "description": "Optional AI SOC analyst and AI security overview."},
    {"name": "platform", "description": "Dashboard, search, docs and demo mode."},
    {"name": "health", "description": "Liveness and readiness."},
]


def startup(settings: Settings) -> tuple[ContentBundle, RateLimiter]:
    """Migrate, sync content, seed demo data. Returns the content bundle."""
    if settings.auto_migrate:
        upgrade_to_head()
    bundle = load_bundle(settings.content_dir)
    if bundle.errors:
        raise ContentError(bundle.errors)
    with session_factory()() as session:
        seed.sync_reference(session, bundle)
        if settings.seed_on_start and settings.demo_mode and seed.needs_demo_seed(session):
            log.info("Seeding synthetic demo data")
            seed.seed_demo(session, bundle)
        session.commit()
    return bundle, RateLimiter(settings.redis_url)


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        logging.basicConfig(
            level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
        )
        bundle, limiter = startup(settings)
        app.state.bundle = bundle
        app.state.limiter = limiter
        yield

    app = FastAPI(
        title="CyberForge API",
        version=__version__,
        description=DESCRIPTION,
        openapi_tags=TAGS,
        lifespan=lifespan,
        license_info={"name": "MIT", "url": "https://opensource.org/license/mit"},
        contact={"name": "Abdurrahman Kutlu", "url": "https://rahmankutlu.com", "email": "info@rahmankutlu.com"},
    )

    app.add_middleware(SecurityMiddleware, settings=settings)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Content-Type", "X-Lab-Token"],
        allow_credentials=False,
        max_age=600,
    )

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("Unhandled error", exc_info=exc)
        return JSONResponse({"detail": "Internal server error"}, status_code=500)

    @app.get("/health", tags=["health"], summary="Liveness")
    @app.get("/api/v1/health", tags=["health"], include_in_schema=False)
    def health() -> dict[str, str]:
        return {"status": "ok", "version": __version__}

    @app.get("/ready", tags=["health"], summary="Readiness: database, content and cache")
    def ready(request: Request) -> JSONResponse:
        checks: dict[str, str] = {}
        ok = True
        try:
            with get_engine().connect() as conn:
                conn.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception:
            checks["database"] = "unavailable"
            ok = False
        checks["content"] = "ok" if getattr(request.app.state, "bundle", None) else "loading"
        ok = ok and checks["content"] == "ok"
        limiter = getattr(request.app.state, "limiter", None)
        checks["rate_limiter"] = limiter.backend if limiter else "loading"
        return JSONResponse(
            {"status": "ready" if ok else "not_ready", "checks": checks},
            status_code=200 if ok else 503,
        )

    app.include_router(api_router)
    return app


app = create_app()
