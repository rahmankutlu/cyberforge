# Contributing to CyberForge

Thanks for helping build an open cybersecurity lab. Fixing a typo, tuning a rule's false-positive notes, adding a lab and reporting a bug are all welcome.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Security issues go through [SECURITY.md](SECURITY.md), not public issues.

## Safety bar

CyberForge is for education and defence. Contributions are reviewed for safety first:

- No functionality that attacks systems you do not own, harvests real credentials, persists, evades detection or deploys malware. No internet-scale scanning.
- Offensive behaviour appears only as **telemetry**, or against the isolated, intentionally vulnerable local container with fake data.
- No exploit code for real software. Describe the vulnerability class and show what it leaves in the logs.
- Use documentation address ranges (RFC 5737) and reserved domains (`.example`).

If in doubt, open an issue and ask before writing code.

## Environment setup

Requirements: Node 22+, pnpm 10, Python 3.12+. Docker is only needed for the container setup and the lab profile.

```bash
git clone https://github.com/rahmankutlu/cyberforge.git
cd cyberforge
pnpm install
python -m venv apps/api/.venv
apps/api/.venv/bin/pip install -e "apps/api[dev]"     # Windows: apps\api\.venv\Scripts\pip
pre-commit install                                     # optional
```

## Frontend workflow

The web app is in `apps/web` (Next.js App Router, TypeScript strict, Tailwind v4); shared primitives are in `packages/ui` and API types in `packages/types`.

```bash
pnpm dev:api        # API on http://localhost:8000 (SQLite, seeded)
pnpm dev:web        # web on http://localhost:3000
pnpm lint && pnpm typecheck
pnpm test:web       # Vitest
```

Prefer Server Components and URL state for anything shareable; add `"use client"` only where state or effects are needed. Use the `packages/ui` primitives and design tokens, and keep dark and light themes, keyboard use and reduced motion working.

## Backend workflow

The API is in `apps/api/cyberforge` (FastAPI, SQLAlchemy 2, Alembic, Pydantic).

```bash
pnpm lint:api       # ruff
pnpm typecheck:api  # mypy
pnpm test:api       # pytest
```

A schema change needs an Alembic migration in `apps/api/cyberforge/migrations/versions`; the tests check that migrations produce every model table. Use SQLAlchemy Core/ORM constructs rather than raw SQL, `yaml.safe_load` for YAML, and type hints on public functions.

## Tests

| Suite      | Command         | Covers                                                         |
| ---------- | --------------- | -------------------------------------------------------------- |
| Pytest     | `pnpm test:api` | content integrity, Sigma engine, guardrails, HTTP API          |
| Vitest     | `pnpm test:web` | UI logic and components                                        |
| Playwright | `pnpm test:e2e` | critical user flows against a fresh API and a production build |

Behaviour changes need tests; a bug fix needs a test that fails without the fix. Run `pnpm test:e2e` when you touch a user-facing flow (set `PW_CHANNEL=msedge` or `chrome` to reuse an installed browser instead of downloading one).

## Content validation

```bash
pnpm validate:content
```

This checks lab and rule schemas, Sigma syntax, MITRE identifiers, that every lab's scenario triggers exactly the rules it declares, and that links resolve. Run it whenever you touch `labs/`, `detections/`, `datasets/`, `mitre/`, `examples/`, `packages/security-content/` or `docs/`.

## Adding a lab

Follow [Contributing labs](docs/contributing-labs.md). A lab is a directory under `labs/<domain>/<slug>/` with a `lab.yaml` (the source of truth), a `telemetry/scenario.jsonl`, and a README produced by `pnpm content:labs`. The scenario must trigger the detections the lab declares, and it must be entirely synthetic.

## Adding a Sigma detection

Rules live in `detections/sigma/<area>/`, one rule (or one base-plus-correlation set) per file.

- Include `title`, `description`, `logsource`, `detection`, `falsepositives`, `level`, `references` and ATT&CK `tags`. The first `attack.t…` tag is the primary technique.
- Prove it: add or extend a lab scenario so the rule fires, and make sure benign activity in the datasets does not trigger it.
- Give a new rule the placeholder id `00000000-0000-0000-0000-000000000001` and run `python scripts/assign_rule_ids.py` to replace it with a stable UUID.
- Validate it in the [playground](docs/detections.md) or with `pnpm validate:content`.

## MITRE mappings

Techniques come from `mitre/curated.yaml`. Add an ID there and run `pnpm content:mitre`; the script fails if the ID does not exist in the upstream ATT&CK or ATLAS release, so mappings cannot reference invented techniques. `mitre/*.json` are generated; do not edit them by hand.

## Pull requests

- Do one thing and explain why in the description; link the issue.
- Include tests and update documentation and `.env.example` when behaviour or configuration changes.
- Keep dependencies minimal; prefer the standard library or an already-used package.
- Before pushing, run `pnpm lint`, `pnpm typecheck`, `pnpm typecheck:api`, `pnpm test` and `pnpm validate:content`, plus `pnpm format` for Prettier (`ruff format` for Python). CI runs the same checks.
- Use short, imperative commit subjects (`Add encoded-PowerShell filter for SCCM`). PRs are squash-merged.

A maintainer reviews for safety, correctness, teaching quality and maintainability, in that order.

## Generated files

`mitre/*.json`, `datasets/**` and lab READMEs are generated. Change the generator or the source, then regenerate (`pnpm content:mitre`, `python scripts/generate_datasets.py`, `pnpm content:labs`).

## Licensing

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE) and that you have the right to submit it. Do not paste content you cannot relicense, such as vendor documentation or rules from repositories with incompatible licenses.
