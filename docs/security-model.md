# Security model

CyberForge is a security tool that ships intentionally vulnerable content, so its own security posture matters twice. This page describes what is protected, how, and where the limits are.

## Scope and assumptions

- **A local, single-user tool.** It runs on your machine or a trusted lab host. It has no user accounts, no roles and no authentication in v0.1.
- **Do not expose it to the internet.** Everything is bound to `127.0.0.1` by default. If you put it on a shared network, put an authenticating reverse proxy in front and set `CYBERFORGE_ENV=production`.
- **Synthetic by default.** Seeded telemetry is fabricated; real telemetry only enters through the lab ingest endpoint.

## Threats considered

| Threat                                                           | Mitigation                                                                                                                                                                                                                   |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The platform is used to attack something                         | Simulations replay data and send no packets; targets must be lab or private; names are never resolved; the only vulnerable service has no route out.                                                                         |
| A vulnerable lab container is reached from outside               | It has no published port, sits on an `internal` Docker network, and is reachable only through a gateway bound to `127.0.0.1`.                                                                                                |
| A vulnerable lab container is used as a foothold                 | Read-only filesystem, non-root user, all capabilities dropped, `no-new-privileges`, memory/CPU/pid limits, no internet, fake in-memory data, no shell or file access in the app.                                             |
| A web page you visit calls your local API (CSRF / DNS rebinding) | State-changing requests are rejected unless their `Origin` is allow-listed or same-origin (including the trusted proxy's forwarded host); no ambient credentials exist to steal; the API binds to loopback.                  |
| Malicious content in rules, logs or documents                    | Rule YAML is parsed with safe loaders; size limits; Markdown is rendered without raw HTML or images; log and event text is rendered as text; ReDoS surface is limited by size caps and rate limits on evaluation endpoints.  |
| A user-authored regex hangs a worker (ReDoS)                     | The YARA and Suricata previews refuse long patterns and nested quantifiers with a linear check; the Suricata parser uses no backtracking regular expressions; inputs are size-capped; evaluation endpoints are rate-limited. |
| Shipped content points at real infrastructure                    | Stories, demos and datasets are checked: IPv4 addresses must be private or RFC 5737, URLs must use reserved or lab host names. A pull request cannot merge real addresses.                                                   |
| A live event stream exhausts the server                          | At most 20 concurrent streams per process, each ends after `limit` events or ten minutes, the rate is capped, and it replays a fixed synthetic pool: nothing user-supplied is streamed.                                      |
| Injection into the database                                      | SQLAlchemy parameterised queries throughout; `LIKE` input escaped; sort columns whitelisted.                                                                                                                                 |
| Prompt injection through alert data                              | The AI analyst gets no tools, treats telemetry as quoted evidence, must return a fixed schema, and its output is text only.                                                                                                  |
| Secret leakage                                                   | No secrets in the repository; `.env` is git-ignored; the runtime-settings endpoint never returns secrets; AI keys never reach the browser; production start-up rejects placeholder secrets.                                  |
| Supply chain                                                     | Lock files, Dependabot, CodeQL and dependency review in CI; minimal base images; MITRE data generated from official sources and verified.                                                                                    |

## HTTP hardening (API)

Implemented in `apps/api/cyberforge/security.py` and `config.py`:

- **Headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`, a `default-src 'none'` CSP (relaxed only for Swagger UI), `Cache-Control: no-store` for `/api`, and HSTS in production.
- **CSRF:** the Origin check above. CyberForge has no cookies, so classic CSRF has nothing to ride on, but the check also stops a hostile page from driving a local instance.
- **CORS:** explicit allow-list from `CYBERFORGE_CORS_ORIGINS`; wildcards are refused in production.
- **Body limit:** 1 MiB. Rule and event payloads have their own tighter Pydantic limits.
- **Rate limiting:** per-client sliding window (default 600/min; 30/min for expensive endpoints such as translate, test, AI and simulation). Redis-backed when available, in-memory otherwise. `X-Forwarded-For` is honoured only when `CYBERFORGE_TRUST_PROXY` is set.
- **Validation:** every input goes through Pydantic models with length and range limits; sort and filter parameters are whitelisted; identifiers such as profile ids and indicator values are pattern-validated.
- **Errors:** unhandled exceptions return a generic `500`; details go to the server log only.
- **Ingest:** `POST /events/ingest` requires the shared lab token (compared in constant time).

## HTTP hardening (web)

Next.js sets a strict Content-Security-Policy (`default-src 'self'`; scripts allow `'unsafe-inline'` because Next.js hydration needs it without nonces), `X-Frame-Options: DENY`, `nosniff`, a referrer policy, a permissions policy and COOP. External links open with `rel="noopener noreferrer"`. `robots.txt` disallows indexing. The browser only ever talks to the web origin; `/api/v1` is proxied.

## Containers and network

```text
  edge     web ─ api                     published on 127.0.0.1 only; the only network with egress
  backend  api ─ db ─ redis              internal: no route to the internet, nothing published
  lab      api ─ lab-vuln-web ─ gateway  internal: vulnerable services can never reach the internet
  gateway  lab-gateway                   bridge used solely to publish 127.0.0.1:8081
```

- Non-root users (10001/10002), `read_only: true`, `tmpfs` for `/tmp`, `cap_drop: [ALL]`, `no-new-privileges`, health checks, resource limits on lab containers.
- PostgreSQL keeps the minimum capabilities its entrypoint needs; Redis persists nothing.
- Lab containers are behind a Compose **profile**; they do not start unless you ask.
- **Recommendations beyond the defaults:** run Docker rootless or in a VM for the lab profile; keep Docker Desktop's "expose daemon" off; do not bind published ports to `0.0.0.0`; pin image digests in your own fork.

## Secrets and configuration

All configuration is environment-driven and validated at start-up (`Settings`). `.env.example` contains **development-only placeholders**; with `CYBERFORGE_ENV=production` the API refuses to start if the ingest token or database password is a placeholder, or if CORS contains `*`. Generate real values with `openssl rand -hex 24`. Enable your platform's secret scanning (GitHub secret scanning and push protection) on any fork.

## What is deliberately not protected

- There is **no authentication or authorisation** in v0.1. Anyone who can reach the API can read and change everything. Do not expose it.
- Analysts are demo personas; "acting as" an analyst is a convenience, not identity.
- The AI analyst sends telemetry to the provider you configure when you click Analyze.
- The intentionally vulnerable app is vulnerable on purpose; its safety comes from isolation.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md). Please do not open public issues for security problems.
