# Roadmap

Direction, not a promise. Priorities follow contributions and feedback; open an issue to argue for something.

## v0.1

Shipped: the cyber range, mini SOC, detection workbench with a Sigma engine, MITRE ATT&CK and ATLAS explorer, AI security labs, threat-intel workspace, learning tracks and the Docker Compose setup. See the [changelog](CHANGELOG.md).

## v0.2 candidates

- **Real lab collectors:** ship auditd and Sysmon telemetry from Linux and Windows lab VMs to the ingest endpoint.
- **Sigma pipelines:** per-target field mapping (ECS, Splunk CIM, Sentinel ASIM) so translated queries are field-correct.
- **Rule-level tests:** events that must and must not match, stored next to each rule and run in CI.
- **Accounts and RBAC:** authentication, roles and an audit log for shared instances.
- **OpenAPI-generated frontend types:** replace the hand-written `packages/types` and fail CI on drift.
- **Background jobs:** move long simulations and re-evaluation off the request path.
- **More labs:** Kubernetes misconfiguration, SSRF against cloud metadata, phishing triage.
- **AI analyst evaluation:** score analyst output against labelled alerts.

## Non-goals

CyberForge will not become an offensive framework. Weaponised exploits, real-target scanning, credential theft, persistence or evasion tooling, ransomware and anything designed for unauthorised access are out of scope.
