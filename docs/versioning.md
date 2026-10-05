# Versioning and compatibility

CyberForge follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html). From 1.0.0 the surfaces below are the public contract: they change compatibly in minor and patch releases, and an incompatible change is a major release announced in the [changelog](../CHANGELOG.md).

## The public contract

| Surface              | Where it is defined                                                             | Guard in CI                                   |
| -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| REST API (`/api/v1`) | [`docs/api/openapi.json`](api/openapi.json), generated from the code            | `pnpm openapi:check` fails on any difference  |
| Content file formats | JSON Schemas in [`schemas/`](../schemas)                                        | `pnpm schemas:check`, `pnpm validate:content` |
| Command line         | `python -m cyberforge` sub-commands, options and exit codes                     | Pytest                                        |
| Configuration        | Environment variables in [`.env.example`](../.env.example)                      | Pytest, Docker smoke test                     |
| Container images     | `cyberforge-api`, `cyberforge-web`, `cyberforge-lab-web` tags `X.Y.Z` and `X.Y` | Release workflow                              |
| Database             | Alembic migrations upgrade forward within 1.x                                   | CI upgrade, downgrade, upgrade on PostgreSQL  |

## What counts as compatible

- **Compatible (minor or patch):** a new endpoint, an optional request field, a new response field, a new enum value in a response a client must already tolerate, a new lab, rule, story or dataset, a new content field with a default, a new environment variable with a safe default, a new language.
- **Incompatible (major):** removing or renaming an endpoint, field, option or variable; making an optional field required; changing a field's type or meaning; changing a default so that existing deployments behave differently; a content schema change that makes a valid 1.x file invalid.

`pnpm openapi:write` refreshes the committed contract. Reviewers read the diff: additions are fine, removals and type changes are not.

## What is not covered

- The look and layout of the web app, page URLs other than documented ones, and every user-visible string, including translations. Translations are corrected in patch releases.
- Python modules inside `apps/api/cyberforge`. Import them at your own risk; use the REST API or the command line.
- Synthetic data: the exact telemetry, alerts and identifiers that labs, stories and the demo produce may change when content improves.
- Detection rules. A rule's logic may be tightened to cut false positives; its `id` is stable and every change keeps its tests passing.

## Deprecation

A feature is deprecated in a minor release with a note under **Deprecated** in the changelog and, for the API, `deprecated: true` in the contract. It keeps working for at least one further minor release before a major release can remove it.

## Supported versions

Security fixes go to the latest 1.x release. See [SECURITY.md](../SECURITY.md).
