# Changelog

All notable changes to CyberForge are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
