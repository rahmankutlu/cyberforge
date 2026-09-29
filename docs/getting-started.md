# Getting started

CyberForge runs entirely on your machine. There are two ways to run it: with Docker (recommended) or directly from source.

## Option 1: Docker (recommended)

**You need:** Docker with Compose v2 (Docker Desktop, or Docker Engine plus the compose plugin).

```bash
git clone https://github.com/rahmankutlu/cyberforge.git
cd cyberforge
cp .env.example .env
docker compose up --build
```

| Service            | URL                                    | Notes                                            |
| ------------------ | -------------------------------------- | ------------------------------------------------ |
| Web app            | http://localhost:3000                  | The UI. It proxies `/api/v1` to the API.         |
| API                | http://localhost:8000                  | Bound to `127.0.0.1` only.                       |
| API docs           | http://localhost:8000/docs             | Interactive OpenAPI.                             |
| Health / readiness | http://localhost:8000/health, `/ready` | `/ready` checks the database, content and cache. |

On first start the API migrates the database, loads and validates all content, syncs it into PostgreSQL and, in demo mode, seeds synthetic activity. It takes a few seconds.

### Optional: the vulnerable lab containers

```bash
docker compose --profile labs up --build
```

This adds **Acme Portal**, an intentionally vulnerable web app used by labs 01-07, and a gateway on `http://127.0.0.1:8081`. The app has no published port and lives on an internal Docker network with no internet access. Its access log is shipped to CyberForge, so the detections fire on your own activity. Every lab also works without it, through the _Run safe simulation_ button.

### Stopping and resetting

```bash
docker compose down            # stop
docker compose down -v         # stop and delete the database volume
```

Settings → _Reset demo data_ re-seeds synthetic activity without touching the volume.

## Option 2: From source

**You need:** Node.js 22+, pnpm 10, Python 3.12+.

```bash
pnpm install

python -m venv apps/api/.venv
apps/api/.venv/bin/pip install -e "apps/api[dev]"        # Windows: apps\api\.venv\Scripts\pip

pnpm dev:api     # FastAPI on http://localhost:8000, SQLite in .data/, auto-migrated and seeded
pnpm dev:web     # Next.js on http://localhost:3000 (in a second terminal)
```

No PostgreSQL or Redis is needed in this mode: the API uses SQLite and an in-memory rate limiter. (`pnpm` is available through `corepack enable` if you do not have it.)

## Your first ten minutes

1. **Dashboard.** Everything is labelled synthetic. Try _Generate demo telemetry_ to add fresh alerts.
2. **Lifecycle** (`g` then `l`). Choose an alert on the left and click through the eight stages. Press _Play_ to have it walk itself.
3. **Labs → Suspicious PowerShell Detection Simulation.** Click _Start simulation_. Open a generated alert.
4. **Mini SOC → Alerts.** Filter by severity, open an alert, change its status, assign it, add a note, then _Create investigation_.
5. **Detections → Playground.** Validate the encoded-PowerShell rule, translate it to Splunk and KQL, and test it against the lab scenario.
6. **MITRE ATT&CK.** Find `T1059.001` on the heatmap; switch to _Detection coverage_ to see the gaps.
7. **Search anywhere** with <kbd>⌘</kbd>/<kbd>Ctrl</kbd> + <kbd>K</kbd>. Press <kbd>?</kbd> for keyboard shortcuts.

## Configuration

Everything is configured through environment variables; see [`.env.example`](../.env.example).

| Variable                                         | Default                     | Purpose                                                                                                |
| ------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `CYBERFORGE_ENV`                                 | `development`               | `production` enables strict start-up checks (below).                                                   |
| `CYBERFORGE_DEMO_MODE`                           | `true`                      | Seed and generate synthetic activity. Turn off to start empty.                                         |
| `DATABASE_URL`                                   | SQLite                      | PostgreSQL in Docker (`postgresql+psycopg://…`).                                                       |
| `REDIS_URL`                                      | _(unset)_                   | Shared rate-limit counters. Optional.                                                                  |
| `CYBERFORGE_CORS_ORIGINS`                        | localhost:3000              | Origins allowed to make state-changing browser calls. No wildcards.                                    |
| `CYBERFORGE_TRUST_PROXY`                         | `false` (`true` in compose) | Trust `X-Forwarded-*` from the web proxy for same-origin checks.                                       |
| `CYBERFORGE_LAB_INGEST_TOKEN`                    | placeholder                 | Shared secret for lab containers to ship telemetry.                                                    |
| `CYBERFORGE_RATE_LIMIT_PER_MINUTE`               | `600`                       | Per-client request limit. Expensive endpoints use `CYBERFORGE_EXPENSIVE_RATE_LIMIT_PER_MINUTE` (`30`). |
| `CYBERFORGE_AI_PROVIDER`                         | `none`                      | `openai` (any OpenAI-compatible API), `gemini` or `ollama`.                                            |
| `CYBERFORGE_AI_MODEL` / `_API_KEY` / `_BASE_URL` | _(unset)_                   | Provider settings. Never displayed in the UI.                                                          |
| `WEB_PORT`, `API_PORT`, `LAB_GATEWAY_PORT`       | 3000 / 8000 / 8081          | Host ports (always bound to `127.0.0.1`).                                                              |

In production mode the API **refuses to start** with placeholder passwords or tokens, or with wildcard CORS. CyberForge is designed as a local tool; read the [security model](security-model.md) before exposing it beyond your machine.

### Enabling the AI analyst (optional)

```bash
CYBERFORGE_AI_PROVIDER=ollama
CYBERFORGE_AI_MODEL=<a model you have pulled>
CYBERFORGE_AI_BASE_URL=http://host.docker.internal:11434
```

With Ollama nothing leaves your machine. With a hosted provider, an alert's telemetry is sent to it **only when you click _Analyze with AI_**. See [AI security](ai-security.md).

## Running the tests

```bash
pnpm test              # Vitest (web) + Pytest (API)
pnpm test:e2e          # Playwright; builds the web app and starts a fresh API on ports 8100/3100
pnpm validate:content  # labs, Sigma, MITRE IDs, scenarios, links
```

Playwright downloads its own browsers with `pnpm --filter @cyberforge/web exec playwright install chromium`. To use an installed browser instead, set `PW_CHANNEL=chrome` (or `msedge`).

## Troubleshooting

**Actions fail with "Cross-origin request rejected".** The API accepts state-changing browser requests only from allow-listed origins or the same origin as the web app. If you serve the web app on another host or port, add it to `CYBERFORGE_CORS_ORIGINS`.

**The page says it "could not be loaded".** The API is still starting or is unreachable. Check `docker compose ps` and `http://localhost:8000/ready`.

**Port already in use.** Set `WEB_PORT` / `API_PORT` in `.env`.

**Windows.** Use PowerShell or Git Bash; all `pnpm` scripts are cross-platform. `pnpm build` uses a normal (non-standalone) Next.js output on Windows because standalone output needs symlink privileges; the Docker image builds standalone inside Linux.

**Start over.** Delete `.data/` (SQLite) or run `docker compose down -v` (PostgreSQL).
