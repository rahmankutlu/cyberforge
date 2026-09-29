"""HTTP hardening: security headers, Origin-based CSRF check, body limits and rate limiting.

CyberForge's API has no cookies or ambient credentials, so classic CSRF has little to steal, but a
malicious web page could still make a visitor's browser call a locally running instance. The Origin
check below rejects state-changing browser requests from origins outside the allow-list.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict, deque
from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from cyberforge.config import Settings

log = logging.getLogger(__name__)

MAX_BODY_BYTES = 1_048_576  # 1 MiB
MUTATING = {"POST", "PUT", "PATCH", "DELETE"}
DOCS_PATHS = ("/docs", "/redoc", "/openapi.json")
# Endpoints that cost real CPU (rule compilation, regex, LLM calls) get a tighter limit.
EXPENSIVE_PREFIXES = (
    "/api/v1/detections/validate",
    "/api/v1/detections/translate",
    "/api/v1/detections/test",
    "/api/v1/playground/run",
    "/api/v1/ai/analyze-alert",
    "/api/v1/lab-runs",
    "/api/v1/demo",
)

API_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
DOCS_CSP = (
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https://fastapi.tiangolo.com; "
    "frame-ancestors 'none'"
)


class RateLimiter:
    """Sliding-window limiter. Uses Redis when reachable, otherwise per-process memory."""

    def __init__(self, redis_url: str | None):
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._redis = None
        if redis_url:
            try:
                import redis

                client = redis.Redis.from_url(
                    redis_url, socket_timeout=0.25, socket_connect_timeout=0.25
                )
                client.ping()
                self._redis = client
            except Exception as exc:
                log.warning(
                    "Redis unavailable (%s); rate limiting is in-memory", type(exc).__name__
                )

    @property
    def backend(self) -> str:
        return "redis" if self._redis else "memory"

    def allow(self, key: str, limit: int, window: int = 60) -> tuple[bool, int]:
        """Return (allowed, retry_after_seconds)."""
        if self._redis is not None:
            try:
                bucket = f"cf:rl:{key}:{int(time.time()) // window}"
                count = self._redis.incr(bucket)
                if count == 1:
                    self._redis.expire(bucket, window + 1)
                return (count <= limit, window - int(time.time()) % window)
            except Exception:
                log.warning("Redis rate limiter unavailable; falling back to in-memory limits")
                self._redis = None
        now = time.monotonic()
        hits = self._hits[key]
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            return False, max(1, int(window - (now - hits[0])))
        hits.append(now)
        return True, 0


class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, settings: Settings):
        super().__init__(app)
        self.settings = settings
        self.allowed_origins = set(settings.cors_origin_list)
        self._fallback = RateLimiter(None)  # used until the app's limiter (Redis-aware) is ready

    def _client_key(self, request: Request) -> str:
        if self.settings.trust_proxy:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                return forwarded.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    def _origin_ok(self, request: Request) -> bool:
        """Accept a browser Origin if it is allow-listed or same-origin.

        Same-origin means it matches the request's own Host, or - when the API sits behind the
        trusted web proxy (CYBERFORGE_TRUST_PROXY) - the host the browser originally addressed
        (X-Forwarded-Host). A page on another site can never produce either match.
        """
        origin = request.headers.get("origin")
        if origin is None:  # non-browser client (curl, lab containers, tests)
            return True
        if origin in self.allowed_origins:
            return True
        parsed = urlparse(origin)
        if parsed.netloc == request.headers.get("host", ""):
            return True
        if self.settings.trust_proxy:
            forwarded_host = request.headers.get("x-forwarded-host")
            forwarded_proto = request.headers.get("x-forwarded-proto")
            if forwarded_host and parsed.netloc == forwarded_host:
                return forwarded_proto is None or parsed.scheme == forwarded_proto
        return False

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if request.method in MUTATING and not self._origin_ok(request):
            return JSONResponse({"detail": "Cross-origin request rejected"}, status_code=403)

        length = request.headers.get("content-length")
        if length and length.isdigit() and int(length) > MAX_BODY_BYTES:
            return JSONResponse({"detail": "Request body too large"}, status_code=413)

        if path.startswith("/api/") and path != "/api/v1/health":
            limiter: RateLimiter = getattr(request.app.state, "limiter", self._fallback)
            client = self._client_key(request)
            allowed, retry = limiter.allow(f"g:{client}", self.settings.rate_limit_per_minute)
            if allowed and request.method != "GET" and path.startswith(EXPENSIVE_PREFIXES):
                allowed, retry = limiter.allow(
                    f"x:{client}", self.settings.expensive_rate_limit_per_minute
                )
            if not allowed:
                return JSONResponse(
                    {"detail": "Rate limit exceeded"},
                    status_code=429,
                    headers={"Retry-After": str(retry)},
                )

        response = await call_next(request)
        headers = response.headers
        headers["X-Content-Type-Options"] = "nosniff"
        headers["X-Frame-Options"] = "DENY"
        headers["Referrer-Policy"] = "no-referrer"
        headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        headers["Cross-Origin-Resource-Policy"] = "same-site"
        headers["Content-Security-Policy"] = DOCS_CSP if path.startswith(DOCS_PATHS) else API_CSP
        if path.startswith("/api/"):
            headers["Cache-Control"] = "no-store"
        if self.settings.env == "production":
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response
