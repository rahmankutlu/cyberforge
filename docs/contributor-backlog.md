# Contributor backlog

Ready-to-pick-up ideas, each sized so a first contribution fits in an evening. Every one follows a guide that tells you exactly which files to add, and CI tells you whether you got it right.

Pick one, open an issue using the matching template (so nobody duplicates it), and start. Nothing here is assigned; nothing here needs you to understand the whole codebase.

**How to read the list.** _Type_ names the issue template. _Size_ is a rough guess: **S** under an hour, **M** an evening, **L** a weekend. _Start with_ points at the closest existing example to copy.

## Detections

| #   | Idea                                                                                                                        | Type             | Size | Start with                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---- | ------------------------------------------------------------------------------------- |
| 1   | **Linux `sudo` anomaly detection.** Repeated failed `sudo` attempts, then a success, for one user (`temporal_ordered`).     | New Sigma rule   | M    | `linux-ssh-login-after-failed-burst`, [Creating a detection](creating-a-detection.md) |
| 2   | **Windows `net user /add` and `net localgroup administrators`.** A process-creation rule for local account tampering.       | New Sigma rule   | S    | `win-local-admin-account-created` (event-based sibling)                               |
| 3   | **Add tests for YARA rules.** Design a small file-based test format for YARA (sample strings that must and must not match). | Good first issue | L    | `detections/yara/`, [Testing detections](testing-detections.md)                       |
| 4   | **Unusual `rundll32` child processes.** Rule and tests for `rundll32.exe` launching network-capable binaries.               | New Sigma rule   | S    | `win-lsass-memory-dump-command-line`                                                  |

## Datasets

| #   | Idea                                                                                                                      | Type        | Size | Start with                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ----------- | ---- | ------------------------------------------------------ |
| 5   | **AWS CloudTrail dataset.** ~40 synthetic events: a normal day, then an access-key abuse sequence. Expected rules listed. | New dataset | M    | `detections/playground/` datasets, `datasets/cloud/`   |
| 6   | **Kubernetes audit-log dataset.** Synthetic API-server audit events including a `pods/exec` into a privileged pod.        | New dataset | M    | the `cloud_audit` category in the telemetry vocabulary |
| 7   | **Nginx access log with a scanner burst.** Benign traffic plus a directory-enumeration sequence, with expected matches.   | New dataset | S    | `web-sensitive-file-probe`                             |

## Labs and stories

| #   | Idea                                                                                                                          | Type      | Size | Start with                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------- | ---- | --------------------------------------------------------------------------------------- |
| 8   | **Kubernetes audit-log lab.** Anonymous access and a privileged pod, with detections and investigation questions.             | New lab   | L    | `pnpm create:lab cloud kubernetes-audit-log`, [Contributing labs](contributing-labs.md) |
| 9   | **DNS tunnelling story.** An analyst follows beaconing from a workstation through DNS telemetry to containment.               | New story | M    | the shipped stories in `stories/`, `dns-txt-query-with-encoded-label`                   |
| 10  | **Phishing triage story.** From a reported email to header analysis, link detonation _in a lab_ and mailbox clean-up.         | New story | M    | `stories/compromised-developer-workstation.yaml`                                        |
| 11  | **SSRF against the cloud metadata service (lab).** A synthetic web app fetches an internal URL; the detection is the request. | New lab   | L    | `labs/api/`, `labs/cloud/`                                                              |

## Documentation and tooling

| #   | Idea                                                                                                                         | Type             | Size | Start with                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---- | -------------------------------- |
| 12  | **A "read this rule" walkthrough.** Annotate one real rule line by line: logsource, selections, conditions, filters, tests.  | Documentation    | S    | `win-encoded-powershell-command` |
| 13  | **Rule-test coverage badge.** Generate an SVG from `cyberforge content stats --json` in CI and reference it from the README. | Good first issue | M    | `.github/workflows/ci.yml`       |
| 14  | **Translate-and-verify for correlations.** Surface which backends can express each correlation type in the playground.       | Good first issue | M    | `sigma_service.translate`        |

## Before you start

- Everything must be **synthetic and local**: documentation-range IPs (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`), reserved domains (`*.example`, `*.lab.internal`), harmless payloads. No real victim data, no working exploit code.
- Run `pnpm validate:content` and `pnpm test:detections` before you push.
- Not sure? Open a draft pull request early; asking "is this the right shape?" is welcome.
