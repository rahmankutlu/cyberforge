# Changelog

All notable changes to CyberForge are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-05

The first stable release. It includes everything developed for the planned 0.2 line and adds Turkish language support. Every v0.1 lab, rule and dataset keeps working unchanged.

The release theme is _understanding and trusting detections_: see why a rule matched, prove it with tests, follow whole incidents, and make it easy to contribute.

### Added

- **Detection playground** (`/detections/playground`): a three-pane tool (rule, test data, explanation) for Sigma, YARA and Suricata. The **match trace** shows every selection, field, value and the condition path for any event, matched or not, with false-positive hints, translations, the MITRE mapping and notes. Eleven curated synthetic datasets, each listing the rules it is expected to trigger (checked in CI).
- **Rule test framework:** `<rule>.tests.yml` beside every Sigma rule (or `tests.yml` beside `rule.yml`) with positive, negative, multi-event and correlation cases. `pnpm test:detections` / `python -m cyberforge detections test` discovers, validates and runs them with the engine the SOC uses, prints per-case results, writes a CI summary and exits non-zero on failure. 204 tests cover all 56 Sigma rules.
- **CI detection gate:** a pull request fails if a rule or its tests are invalid, a positive test does not match, a negative test matches, a MITRE identifier is unknown, or a rule has no positive and negative test.
- **Coverage and quality:** detection test coverage and seven deterministic quality checks per rule (schema, MITRE, description, false-positive notes, positive tests, negative tests, translation verified), calculated from the repository and shown in the README, the dashboard, the rule pages and the CI summary.
- **Attack stories** (`/stories`): five complete synthetic incidents (compromised developer workstation, suspicious admin account activity, web application intrusion, credential abuse and lateral movement, AI agent tool abuse) with progressive evidence reveal, findings, questions, analyst decisions, containment, a post-incident explanation, a live pipeline strip and an investigation graph. CI proves each declared detection fires on its step and that all data is synthetic.
- **Demo mode** (`/demo`): a deterministic 80-second incident with Start, Pause, Reset and 1x/2x/4x speed: telemetry ingestion, detections, alerts, escalating severity, a MITRE heatmap, the process chain, analyst notes, containment and a generated summary. No external service and no AI provider.
- **Live event stream:** a Server-Sent Events feed of synthetic events on the dashboard (`GET /api/v1/stream/events`).
- **Community lab SDK:** `pnpm create:lab <domain> <slug>` scaffolds a lab that already validates (manifest, README, scenario, lab-local rule with tests, lab tests, optional isolated docker-compose). Labs may ship their own `detections/`, and `tests/lab.tests.yml` asserts what the scenario must and must not trigger. JSON Schema for lab, story, dataset, demo and test files in `schemas/`.
- **CLI:** `python -m cyberforge` with `detections test`, `detections quality`, `content stats`, `validate`, `lab create`, `lab validate` and `story validate`.
- **MITRE coverage:** what labs, detections, stories and tests cover, techniques lacking a tested rule, and a platform filter (Windows, Linux, Network, Web, Cloud, AI security). Adds T1021.002, T1098.001 and T1195.
- **Search:** stories and datasets are indexed; a technique id finds everything mapped to it (and to its sub-techniques), a tactic name finds its techniques and their content, and `sigma`, `yara`, `suricata` and log-source words find rules.
- **New Sigma rule:** administrative share accessed over the network by a user account (T1021.002).
- **Contributor experience:** guides for creating a lab and a detection and for testing detections; a contributor backlog; issue templates for good first issues, Sigma rules, datasets, labs, stories and documentation; `examples/custom-detection` and `examples/custom-lab`.
- **Visuals:** `pnpm screenshots` regenerates the README screenshots and a demo GIF from a seeded instance ([Demo assets](docs/demo-assets.md)); README counts are generated from the repository and checked in CI.

- **Turkish language support:** the whole interface and all authored content (labs, stories, learning tracks, detections, the AI security model, threat intelligence, example incidents) are available in Turkish, chosen with the language switcher or the browser's `Accept-Language` and stored in a cookie. Dates, numbers and `<html lang>` follow the locale. The 2,239-entry content catalogue is human-reviewed against a terminology glossary.
- **Translation tooling and guardrails:** `pnpm i18n:check` (CI) lists missing, stale and damaged translations and rejects any that alter code, links, addresses, ATT&CK ids or placeholders; `pnpm i18n:sync` adds empty entries; Vitest enforces key parity, placeholder and tag parity, and the Turkish glossary; Playwright covers the switcher, translated pages and axe checks in Turkish. See [Localization](docs/localization.md).

- **Stable 1.x contract:** the REST API is now a versioned contract. `docs/api/openapi.json` is generated from the code, `pnpm openapi:check` fails CI when it drifts, and [docs/versioning.md](docs/versioning.md) states what is compatible, what needs a major release and how deprecation works.
- **Coverage gates:** Pytest with branch coverage (91% measured, floor 88%) and Vitest with coverage (floors on `src/lib` and overall), both run in CI. New unit tests cover navigation and its Turkish labels.
- **Security audit workflow:** a weekly and on-change `pnpm audit` and `pip-audit` of the locked dependencies, in addition to CodeQL and dependency review.
- **Dev container:** `.devcontainer` with Node 22, Python 3.12, Docker and Playwright for a one-step contributor environment.

### Changed

- The README leads with the attack-to-investigation flow, a demo, and generated counts.
- `/detections/playground` is now the three-pane tool above; the older validate, translate and test flows live on in its tabs. `/detections/new` is unchanged.
- The API's security headers keep an endpoint's own `Cache-Control` for event streams so proxies do not buffer them.

### Fixed

- Lifecycle stage summaries, lab-run toasts, correlation-hit counts and the SOC overview's empty state were English-only; they are now localized.
- Sentences assembled from fragments (links, counts, "N of M" phrases) are whole translatable messages, so Turkish word order and suffixes are correct.

### Security

- `pip-audit` reports PYSEC-2026-2447 (pickle deserialisation in `diskcache`, a transitive dependency of pySigma with no fixed release). CyberForge does not call the affected ATT&CK data helper and creates no cache directory, so the advisory is ignored in the audit workflow with this rationale until a fix is published.
- YARA and Suricata previews use small teaching evaluators that report what they cannot run instead of guessing; user regular expressions in them are refused when they are long or have nested quantifiers (a linear check), and the Suricata rule parser has no backtracking regular expressions.
- Stories, demos and datasets may only use RFC 1918 and RFC 5737 addresses and reserved host names (enforced by validation).
- The live stream is bounded (at most 20 concurrent streams, ten minutes each) and rate-limited like other expensive endpoints.

### Compatibility

- Every v0.1 lab, rule and dataset continues to validate unchanged; no schema was changed incompatibly. New file types and directories (`stories/`, `demos/`, `datasets/playground/`, `schemas/`) are additive.

## [0.1.0]

First release.

### Added

- **Cyber range:** 20 labs across web, API, Linux, Windows simulation, network, cloud and AI security, each with objectives, a safe simulation, expected detections, MITRE mapping, investigation questions, mitigation and cleanup. One intentionally vulnerable web application runs in an isolated container behind the `labs` Compose profile.
- **Attack → Log → Detection view:** an eight-stage lifecycle from simulation to mitigation, with matched values highlighted in the raw log.
- **Mini SOC:** alert queue, alert detail, analyst notes, assignment, investigations with timelines, and incident reports exported as Markdown or JSON.
- **Detection engineering:** 55 Sigma rules (10 of them correlations), 5 YARA rules and 5 Suricata rules; a Sigma evaluation engine with `event_count`, `value_count`, `temporal` and `temporal_ordered` correlations; a playground that validates, translates (Elastic, Splunk, Sentinel KQL, OpenSearch, SQL-like) and tests rules.
- **MITRE ATT&CK explorer:** coverage heatmap, detection gaps and technique pages, generated from official ATT&CK and ATLAS data with an identifier check.
- **AI security labs:** a trust-boundary model, findings view and five labs with synthetic agents.
- **AI SOC analyst (optional):** advisory analysis of an alert via OpenAI-compatible APIs, Gemini or Ollama. The model has no tools and nothing it suggests is executed.
- **Threat-intel workspace:** local indicators with tags, confidence and related alerts.
- **Learning:** six tracks and _30 Days of CyberForge_, with progress stored in the browser.
- **Synthetic telemetry:** deterministic background datasets, 10 example incidents and demo-mode seeding.
- **Platform:** command palette and global search, dark and light themes, `pnpm validate:content`, OpenAPI export.

### Security

- Simulation targets are limited to `localhost`, private addresses and `*.lab.internal`; no name resolution.
- Origin-based CSRF check, security headers, request body limit, rate limiting, and start-up checks that reject development secrets in production mode.
- Docker Compose with segmented networks, read-only non-root containers with dropped capabilities, and every published port bound to `127.0.0.1`.

### Tooling

- GitHub Actions for CI (lint, type checks, Vitest, Pytest, build, content validation, PostgreSQL migrations, container build), Playwright end-to-end tests, CodeQL, dependency review and tagged releases; Dependabot.

[0.1.0]: https://github.com/rahmankutlu/cyberforge/releases/tag/v0.1.0
[Unreleased]: https://github.com/rahmankutlu/cyberforge/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/rahmankutlu/cyberforge/compare/v0.1.0...v1.0.0
