"""Acme Portal: an INTENTIONALLY VULNERABLE training application.

*** Never deploy this. Never expose it beyond the isolated CyberForge lab network. ***

It exists so CyberForge labs 01-07 can be practised against a real (local) target. It deliberately
contains: no login throttling, SQL injection, reflected XSS, IDOR, a JWT verifier that accepts
`alg: none`, an exposed .env / .git/config, and an un-throttled API. Everything else is locked down:

  * all data is fake and held in an in-memory SQLite database
  * there is no file access, no shell access and no outbound request except log shipping to the
    CyberForge API on the internal lab network
  * the container runs read-only, non-root, with all capabilities dropped (see docker-compose.yml)

Every request is shipped to CyberForge as a web-access event, so the Sigma rules for these flaws fire
on genuine lab activity, not just on replayed telemetry.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import html
import json
import os
import queue
import sqlite3
import threading
import time
from typing import Any

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse

INGEST_URL = (
    os.environ.get("CYBERFORGE_API_URL", "http://api:8000").rstrip("/")
    + "/api/v1/events/ingest"
)
INGEST_TOKEN = os.environ.get("CYBERFORGE_LAB_INGEST_TOKEN", "")
JWT_SECRET = b"secret"  # intentionally weak (lab 05)
LAB_HOST = os.environ.get("LAB_HOSTNAME", "acme-portal")

# --- fake data ------------------------------------------------------------------------------------

USERS = {
    "alice": {"password": "alice-lab-pass", "role": "user", "id": 1},
    "jsmith": {
        "password": "Summer2024!",
        "role": "user",
        "id": 2,
    },  # guessable on purpose (lab 01)
    "bob": {"password": "bob-lab-pass", "role": "user", "id": 3},
    "admin": {"password": "admin", "role": "admin", "id": 4},
}
INVOICES = {
    i: {
        "id": i,
        "owner": ["alice", "jsmith", "bob"][i % 3],
        "amount": 100 + i * 7,
        "note": f"Invoice {i}",
    }
    for i in range(1001, 1061)
}

db = sqlite3.connect(":memory:", check_same_thread=False)
db.executescript(
    """
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL);
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password TEXT);
    INSERT INTO products VALUES (1,'Laptop 14',999.0),(2,'Laptop 16',1499.0),(3,'Printer',179.5),(4,'Monitor 27',329.0),(5,'Dock',149.0);
    INSERT INTO users VALUES (1,'alice','fake-hash-1'),(2,'jsmith','fake-hash-2'),(3,'admin','fake-hash-3');
    """
)

FAKE_ENV = (
    "# FAKE lab secrets. Nothing here is real. Canary marker: CF-CANARY-ENVFILE1\n"
    "DATABASE_URL=postgres://acme:cf_demo_0000000000000000@db.lab.internal/acme\n"
    "API_KEY=cf_demo_0000000000000000\n"
)
FAKE_GIT_CONFIG = '[core]\n\trepositoryformatversion = 0\n[remote "origin"]\n\turl = https://git.lab.internal/acme/portal.git\n'

# --- minimal JWT (deliberately flawed) ---------------------------------------------------------------


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def make_token(username: str, role: str) -> str:
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    payload = _b64(
        json.dumps({"sub": username, "role": role, "iat": int(time.time())}).encode()
    )
    sig = _b64(
        hmac.new(JWT_SECRET, f"{header}.{payload}".encode(), hashlib.sha256).digest()
    )
    return f"{header}.{payload}.{sig}"


def read_token(token: str) -> tuple[dict[str, Any], str]:
    """Return (claims, alg). FLAW: trusts the token's own header and accepts alg=none."""
    try:
        header_b64, payload_b64, sig = token.split(".")
        header = json.loads(_unb64(header_b64))
        claims = json.loads(_unb64(payload_b64))
    except Exception as exc:
        raise HTTPException(401, "Malformed token") from exc
    alg = str(header.get("alg", ""))
    if alg.lower() == "none":  # <- the flaw
        return claims, alg
    expected = _b64(
        hmac.new(
            JWT_SECRET, f"{header_b64}.{payload_b64}".encode(), hashlib.sha256
        ).digest()
    )
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(401, "Bad signature")
    return claims, alg


def auth(authorization: str | None) -> tuple[dict[str, Any], str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    return read_token(authorization.split(" ", 1)[1])


# --- telemetry shipping ----------------------------------------------------------------------------------

events: queue.Queue[dict[str, Any]] = queue.Queue(maxsize=2000)


def ship_forever() -> None:
    if not INGEST_TOKEN:
        return  # standalone run: no telemetry
    while True:
        time.sleep(1.5)
        batch: list[dict[str, Any]] = []
        while len(batch) < 100:
            try:
                batch.append(events.get_nowait())
            except queue.Empty:
                break
        if not batch:
            continue
        try:
            httpx.post(
                INGEST_URL,
                json={"source_label": "acme-portal", "events": batch},
                headers={"X-Lab-Token": INGEST_TOKEN},
                timeout=5,
            )
        except httpx.HTTPError:
            pass  # telemetry is best effort; the lab still works


app = FastAPI(
    title="Acme Portal (intentionally vulnerable)",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.on_event("startup")
def _start() -> None:
    threading.Thread(target=ship_forever, daemon=True).start()


@app.middleware("http")
async def log_requests(request: Request, call_next):  # type: ignore[no-untyped-def]
    response = await call_next(request)
    if request.url.path != "/healthz":
        auth_header = request.headers.get("authorization", "")
        fields: dict[str, Any] = {
            "c-ip": request.headers.get("x-real-ip")
            or (request.client.host if request.client else "unknown"),
            "cs-method": request.method,
            "cs-uri-stem": request.url.path,
            "sc-status": response.status_code,
            "sc-bytes": int(response.headers.get("content-length", 0) or 0),
            "cs-user-agent": request.headers.get("user-agent", "-"),
        }
        if request.url.query:
            fields["cs-uri-query"] = request.url.query
        if auth_header.lower().startswith("bearer "):
            try:
                header = json.loads(_unb64(auth_header.split(" ", 1)[1].split(".")[0]))
                fields["jwt_alg"] = str(header.get("alg", ""))
            except Exception:  # noqa: BLE001, S110
                pass
        try:
            events.put_nowait(
                {
                    "category": "web_request",
                    "host": LAB_HOST,
                    "fields": fields,
                    "outcome": "success" if response.status_code < 400 else "failure",
                }
            )
        except queue.Full:
            pass
    return response


# --- pages and API -------------------------------------------------------------------------------------------

BANNER = "<p style='background:#fee;border:1px solid #c00;padding:8px;font-family:sans-serif'><b>INTENTIONALLY VULNERABLE lab application.</b> Isolated CyberForge lab network only.</p>"


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse)
def home() -> str:
    return (
        f"<html><body style='font-family:sans-serif;max-width:46rem;margin:2rem auto'>{BANNER}<h1>Acme Portal</h1>"
        "<ul><li><a href='/search?q=laptop'>Product search</a> (labs 02, 03)</li>"
        "<li>POST /login: users <code>alice</code>, <code>jsmith</code>, <code>bob</code>, <code>admin</code> (labs 01, 05)</li>"
        "<li>GET /api/invoices/{id} (lab 04) · GET /api/admin/users (lab 05)</li>"
        "<li>POST /api/v1/coupons/redeem (lab 07) · files served by mistake (lab 06)</li></ul></body></html>"
    )


@app.post("/login")
async def login(request: Request) -> JSONResponse:
    """FLAW: no lockout, no throttling, no MFA."""
    data: dict[str, Any] = {}
    ctype = request.headers.get("content-type", "")
    if "json" in ctype:
        data = await request.json()
    else:
        form = await request.form()
        data = {k: str(v) for k, v in form.items()}
    user = USERS.get(str(data.get("username", "")))
    if not user or user["password"] != data.get("password"):
        return JSONResponse({"error": "invalid credentials"}, status_code=401)
    username = str(data["username"])
    return JSONResponse({"token": make_token(username, user["role"]), "user": username})


@app.get("/search", response_class=HTMLResponse)
def search(q: str = "") -> HTMLResponse:
    """FLAWS: string-built SQL (injection), unescaped reflection (XSS), verbose SQL errors."""
    sql = f"SELECT id, name, price FROM products WHERE name LIKE '%{q}%'"
    try:
        rows = db.execute(sql).fetchall()
    except sqlite3.Error as exc:
        return HTMLResponse(
            f"<html><body>{BANNER}<h2>Search error</h2><pre>{html.escape(str(exc))}</pre><pre>{html.escape(sql)}</pre></body></html>",
            status_code=500,
        )
    table = "".join(
        f"<tr><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>" for r in rows
    )
    return HTMLResponse(
        f"<html><body style='font-family:sans-serif'>{BANNER}<h2>Results for {q}</h2><table border=1>{table}</table></body></html>"
    )


@app.get("/profile", response_class=HTMLResponse)
def profile(name: str = "guest") -> str:
    """FLAW: reflected XSS."""
    return f"<html><body style='font-family:sans-serif'>{BANNER}<h2>Profile</h2><input value=\"{name}\"></body></html>"


@app.get("/api/invoices/{invoice_id}")
def invoice(
    invoice_id: int, authorization: str | None = Header(default=None)
) -> dict[str, Any]:
    """FLAW (IDOR): requires a valid session but never checks that the invoice belongs to the caller."""
    auth(authorization)
    if invoice_id not in INVOICES:
        raise HTTPException(404, "No such invoice")
    return INVOICES[invoice_id]


@app.get("/api/admin/users")
def admin_users(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    claims, _ = auth(authorization)
    if claims.get("role") != "admin":
        raise HTTPException(403, "Admins only")
    return {"users": [{"username": u, "role": v["role"]} for u, v in USERS.items()]}


@app.post("/api/v1/coupons/redeem")
def redeem() -> dict[str, Any]:
    """FLAW: no rate limiting."""
    return {"redeemed": True}


@app.get("/.env", response_class=PlainTextResponse)
def env_file() -> str:
    """FLAW: secrets served from the web root (fake values)."""
    return FAKE_ENV


@app.get("/.git/config", response_class=PlainTextResponse)
def git_config() -> str:
    return FAKE_GIT_CONFIG
