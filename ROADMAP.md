# Roadmap

Direction, not a promise. Priorities follow contributions and feedback; open an issue to argue for something. Ideas that are ready to build are in the [contributor backlog](docs/contributor-backlog.md).

## Before 1.0

### v0.1

Shipped: the cyber range, mini SOC, detection workbench with a Sigma engine, MITRE ATT&CK and ATLAS explorer, AI security labs, threat-intel workspace, learning tracks and the Docker Compose setup.

### v0.2

Shipped (see the [changelog](CHANGELOG.md)): a detection playground with match traces, tests for every Sigma rule with a CI gate and coverage, attack stories, a deterministic demo mode with a live event stream, the community lab SDK, MITRE coverage from labs, detections, stories and tests, richer search, and reproducible screenshots and demo GIF.

## v1.0

Shipped: the 0.1 and 0.2 work above as the first stable release, plus Turkish language support for the interface and all authored content, with a reviewed terminology glossary, translation tooling and a CI gate. See [Localization](docs/localization.md).

## v1.1 priorities

- ~~**Sigma pipelines**~~ — shipped: per-target field mapping (ECS, Splunk, Sentinel ASIM) with a mapping table in the playground. See [Detections](docs/detections.md#translation-pipelines).
- **Tests for YARA and Suricata rules:** a small file-based format (samples that must and must not match) and a CI gate, like Sigma has.
- **More stories and datasets:** DNS tunnelling, phishing triage, Kubernetes audit, AWS CloudTrail key abuse. Contributions welcome.
- **Story authoring in the UI:** a preview and validation view so writing a story does not need a terminal.
- **Rule-test coverage badge:** generated in CI from `cyberforge content stats`.
- **Real lab collectors:** ship auditd and Sysmon telemetry from Linux and Windows lab VMs to the ingest endpoint.
- **OpenAPI-generated frontend types:** replace the hand-written `packages/types` and fail CI on drift.

## Later

- **Accounts and RBAC:** authentication, roles and an audit log for shared instances.
- **Background jobs:** move long simulations and re-evaluation off the request path.
- **AI analyst evaluation:** score analyst output against labelled alerts.
- **Team features for stories:** shared runs and a facilitator view for workshops.

## Non-goals

CyberForge will not become an offensive framework. Weaponised exploits, real-target scanning, credential theft, persistence or evasion tooling, ransomware and anything designed for unauthorised access are out of scope.
