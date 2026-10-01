"""Demo mode and the live event stream: deterministic scripts and a small SSE feed.

Everything here is synthetic and read-only. The demo script is derived from a scenario file by the
same engine that powers the SOC; the stream replays a fixed pool of synthetic events. No AI provider
and no external service is involved.
"""

from __future__ import annotations

import asyncio
import json
import random
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, Path, Query, Request
from fastapi.responses import StreamingResponse

from cyberforge.api.deps import BundleDep
from cyberforge.services import demo as demo_service

router = APIRouter(tags=["demo"])

MAX_STREAMS = 20  # concurrent SSE connections per process: enough for a demo, bounded for safety
MAX_STREAM_SECONDS = 600
_active = 0


def _scripts(request: Request, bundle: BundleDep) -> dict[str, dict[str, Any]]:
    cached = getattr(request.app.state, "demo_scripts", None)
    if cached is None:
        cached = {d.slug: demo_service.build_script(d, bundle) for d in bundle.demos}
        request.app.state.demo_scripts = cached
    return cached


@router.get("/demo/scenarios", summary="Demo scenarios")
def list_scenarios(bundle: BundleDep) -> list[dict[str, Any]]:
    return [
        {
            "slug": d.slug,
            "title": d.title,
            "summary": d.summary,
            "duration_seconds": d.duration_seconds,
            "host": d.host,
        }
        for d in bundle.demos
    ]


@router.get("/demo/scenarios/{slug}", summary="The complete, deterministic script of a demo")
def get_scenario(
    slug: Annotated[str, Path(max_length=96)], request: Request, bundle: BundleDep
) -> dict[str, Any]:
    scripts = _scripts(request, bundle)
    if slug not in scripts:
        raise HTTPException(404, "Demo scenario not found")
    return scripts[slug]


def _pool(request: Request, bundle: BundleDep) -> list[dict[str, Any]]:
    cached = getattr(request.app.state, "stream_pool", None)
    if cached is None:
        cached = demo_service.stream_pool(bundle)
        request.app.state.stream_pool = cached
    return cached


@router.get(
    "/stream/events",
    summary="Live synthetic event stream (Server-Sent Events)",
    response_class=StreamingResponse,
)
async def stream_events(
    request: Request,
    bundle: BundleDep,
    rate: Annotated[float, Query(ge=0.2, le=20, description="Events per second")] = 1.5,
    limit: Annotated[int, Query(ge=1, le=5000, description="Stop after this many events")] = 400,
    offset: Annotated[int, Query(ge=0, le=1_000_000)] = 0,
) -> StreamingResponse:
    """One event per message: timestamp, source, host, event type, rule and severity.

    The stream ends by itself (after `limit` events or ten minutes); `EventSource` reconnects.
    """
    pool = _pool(request, bundle)
    if not pool:
        raise HTTPException(503, "No synthetic events available")
    if _active >= MAX_STREAMS:
        raise HTTPException(429, "Too many live streams open; try again shortly")

    async def generate() -> AsyncIterator[str]:
        global _active
        rng = random.Random(offset)  # noqa: S311 - pacing jitter, not security
        started = asyncio.get_running_loop().time()
        _active += 1
        try:
            yield "retry: 3000\n\n"
            for i in range(limit):
                if await request.is_disconnected():
                    break
                if asyncio.get_running_loop().time() - started > MAX_STREAM_SECONDS:
                    break
                item = pool[(offset + i) % len(pool)]
                payload = {**item, "seq": offset + i, "timestamp": datetime.now(UTC).isoformat()}
                yield f"id: {offset + i}\nevent: telemetry\ndata: {json.dumps(payload)}\n\n"
                await asyncio.sleep((1 / rate) * rng.uniform(0.6, 1.4))
        finally:
            _active -= 1

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            # no-transform keeps compression middleware from buffering small SSE chunks
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
