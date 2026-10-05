# Labs

The cyber range is twenty labs. Each one teaches a single idea end to end: an attack, the telemetry it produces, the detection that finds it, how to investigate it, and how to prevent it.

## What every lab contains

Every lab is a directory containing `lab.yaml` (the source of truth), a generated `README.md`, and `telemetry/scenario.jsonl`:

| Field in `lab.yaml`                                 | Meaning                                                                                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `title`, `slug`, `difficulty`, `category`, `domain` | Identity. `slug` must equal the directory name and `domain` the parent directory.                                                   |
| `duration_minutes`, `summary`, `tags`               | Catalogue metadata.                                                                                                                 |
| `objectives`                                        | What you will be able to do afterwards.                                                                                             |
| `architecture`                                      | Description, components (each with a network: `lab-internal`, `backend`, `host-localhost`, `none`) and an optional Mermaid diagram. |
| `scenario`                                          | The story.                                                                                                                          |
| `setup`                                             | Steps, whether containers are needed, and the compose profile.                                                                      |
| `telemetry`                                         | Log sources (with Sigma logsource) and the scenario file.                                                                           |
| `attack_simulation`                                 | What the simulation does, in steps.                                                                                                 |
| `expected_detection`                                | The rules that **must** fire (validated in tests).                                                                                  |
| `mitre`                                             | ATT&CK or ATLAS identifiers (validated against the shipped data).                                                                   |
| `investigation_questions`                           | Each with a hint and an answer.                                                                                                     |
| `mitigation`, `cleanup`, `references`               | The defensive half.                                                                                                                 |
| `safety`                                            | Scope (`simulation-only` or `local-container`), network and any allowed `*.lab.internal` hostnames.                                 |

The JSON-Schema-equivalent lives in [`apps/api/cyberforge/content/schemas.py`](../apps/api/cyberforge/content/schemas.py) (`LabDoc`); the validator rejects unknown keys.

## The catalogue

|   # | Lab                                        | Domain      | Difficulty   |
| --: | ------------------------------------------ | ----------- | ------------ |
|  01 | Broken Authentication                      | web         | beginner     |
|  02 | SQL Injection Fundamentals                 | web         | beginner     |
|  03 | Cross-Site Scripting                       | web         | beginner     |
|  04 | IDOR / Broken Access Control               | web         | intermediate |
|  05 | JWT Misconfiguration                       | api         | intermediate |
|  06 | Secrets Exposure                           | web         | beginner     |
|  07 | API Rate Limit Misconfiguration            | api         | intermediate |
|  08 | Docker Security Misconfiguration           | linux       | intermediate |
|  09 | Linux Authentication Investigation         | linux       | intermediate |
|  10 | Suspicious PowerShell Detection Simulation | windows-sim | intermediate |
|  11 | Network Reconnaissance Detection           | network     | beginner     |
|  12 | DNS Anomaly Investigation                  | network     | intermediate |
|  13 | Web Shell Telemetry Analysis               | windows-sim | advanced     |
|  14 | Brute Force Detection                      | windows-sim | intermediate |
|  15 | Cloud Audit Log Investigation              | cloud       | intermediate |
|  16 | Prompt Injection                           | ai-security | beginner     |
|  17 | Indirect Prompt Injection                  | ai-security | intermediate |
|  18 | RAG Poisoning Concepts                     | ai-security | intermediate |
|  19 | Tool Abuse in AI Agents                    | ai-security | advanced     |
|  20 | MCP Security Misconfiguration              | ai-security | advanced     |

## How a simulation runs

1. You click **Start simulation** (or `POST /api/v1/lab-runs`).
2. The **guardrails** validate an optional target (below).
3. The scenario is **expanded** (`repeat`/`every` bursts and `{i}` templates become individual events), given timestamps ending at "now", and **normalised**: each event gets a realistic raw log line, a Sigma field map and a logsource.
4. Events are stored, the **Sigma engine** evaluates them, and aggregated **alerts** are created.
5. The response tells you how many events and alerts were created, which expected rules fired, and links to the alerts and their lifecycle.

Nothing here touches a network. The scenario is data.

### Scenario file format

One JSON object per line:

```json
{
  "t": 20,
  "repeat": 12,
  "every": 2,
  "category": "web_request",
  "host": "portal-web-01",
  "fields": {
    "c-ip": "198.51.100.23",
    "cs-method": "POST",
    "cs-uri-stem": "/login",
    "sc-status": 401
  },
  "outcome": "failure",
  "note": "Twelve rejected logins in 24 seconds from one client."
}
```

- `t` is seconds from the start; `repeat` and `every` expand a burst; `{i}`, `{i+20}` and `{i*3}` fill templates (a value that is only a placeholder becomes a number).
- `category` selects the telemetry category (see [Detections](detections.md)); `fields` use the Sigma vocabulary.
- `note` is narration shown in the lifecycle view.

Use documentation ranges only: `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` and RFC 1918 space for addresses, and reserved names (`*.example`) for domains.

## Safety guardrails

`services/guardrails.py` validates any simulation `target`:

- accepted: `localhost`, loopback or RFC 1918 addresses, hostnames ending in `.lab.internal`;
- rejected: public addresses (including documentation ranges), URLs, ports, credentials, paths, whitespace and anything else;
- names are **never resolved**, so there is no DNS rebinding.

Labs also declare `safety` in `lab.yaml`. There is no mode in 1.x that sends traffic anywhere: the target field exists so a future live mode inherits the same checks.

## Live mode with Acme Portal

Labs 01-07 have an optional live mode. `docker compose --profile labs up` starts [Acme Portal](../labs/web/vulnerable-app) and a gateway on `127.0.0.1:8081`. Use it from your browser, and the app ships each request to `POST /api/v1/events/ingest` (authenticated by a shared token) where the same Sigma engine evaluates it. Those events and alerts are marked **live** rather than synthetic.

The app is **intentionally insecure** (no lockout, SQL injection, XSS, IDOR, `alg: none` JWTs, exposed `.env`, no rate limit) and is protected by isolation, not by its own code: internal Docker network without internet, no published port, read-only root filesystem, non-root user, all capabilities dropped, memory and CPU limits, fake in-memory data only.

## Regenerating READMEs

`lab.yaml` is the source of truth; the README exists so a lab reads well on GitHub. After editing:

```bash
pnpm content:labs        # regenerate every labs/*/*/README.md
pnpm validate:content    # schemas, scenarios, links
```

To add your own, see [Contributing labs](contributing-labs.md).
