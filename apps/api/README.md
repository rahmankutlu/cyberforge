# CyberForge API

FastAPI service behind CyberForge: content loading, synthetic telemetry, the Sigma detection engine,
the mini SOC, MITRE mapping, threat intelligence, and the optional AI analyst.

```bash
# from the repository root
python -m venv apps/api/.venv
apps/api/.venv/Scripts/pip install -e "apps/api[dev]"   # Windows; use .venv/bin/pip on macOS/Linux
pnpm dev:api          # http://localhost:8000  (SQLite, auto-seeded)
pnpm test:api
```

See [docs/architecture.md](../../docs/architecture.md) for how the pieces fit together.
