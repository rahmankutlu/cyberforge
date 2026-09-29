# Contributing labs

Adding a lab is adding a folder. The validator tells you what is missing, and the tests prove your lab does what it says.

## Ground rules

1. **Safe by design.** A lab replays telemetry or targets an isolated, intentionally vulnerable local container. Never target external hosts; never include working exploit chains against real software, malware, credential theft against real systems, persistence, or evasion techniques. Teach how the attack _looks_ and how to _stop and detect_ it.
2. **Synthetic data only.** IPs from `192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24` or RFC 1918; domains under `.example`; fake secrets with an obvious marker (`cf_demo_…`, `CF-CANARY-…`).
3. **Defensive outcome.** Every lab must include detection, investigation and mitigation, not just an attack.
4. **Real references.** Link to primary sources (MITRE, OWASP, vendor docs).

## 1. Create the folder

```text
labs/<domain>/<slug>/
├── lab.yaml                  source of truth (required)
├── README.md                 generated: `pnpm content:labs`
├── telemetry/scenario.jsonl  the events the simulation replays (required)
├── docker-compose.yml        optional: only if the lab needs its own containers
└── detections/               optional: lab-specific rule notes
```

`<domain>` is one of `web`, `api`, `linux`, `windows-sim`, `network`, `cloud`, `ai-security`. The directory name must equal `slug`, and the parent must equal `domain`.

## 2. Write `lab.yaml`

Copy a similar existing lab. The fields (all required unless noted) are described in [Labs](labs.md#what-every-lab-contains); the schema is `LabDoc` in [`schemas.py`](../apps/api/cyberforge/content/schemas.py). Quote any plain YAML scalar that contains `: `.

Pick `number` as the next unused integer (`pnpm validate:content` rejects duplicates) and choose MITRE identifiers from [`mitre/attack.json`](../mitre/attack.json). If you need one that is not there, add it to [`mitre/curated.yaml`](../mitre/curated.yaml) and run `pnpm content:mitre`: never type an identifier from memory.

## 3. Write the scenario

One JSON event per line, using Sigma field names (see the [telemetry vocabulary](detections.md#telemetry-vocabulary)). Use `repeat`/`every` for bursts and `note` to narrate each step.

```json
{
  "t": 0,
  "category": "linux_auth",
  "host": "bastion-01",
  "fields": {
    "Program": "sshd",
    "Message": "Failed password for invalid user admin from 203.0.113.50 port {i+40000} ssh2",
    "SrcIP": "203.0.113.50"
  },
  "repeat": 10,
  "every": 3,
  "outcome": "failure"
}
```

Include _benign_ events too: a baseline makes the anomaly meaningful.

## 3b. Reuse or write the rules

List existing rule slugs in `expected_detection.rules` if they already detect your behaviour. Otherwise add a Sigma rule under `detections/sigma/<platform>/` (see [Detections](detections.md)), then `python scripts/assign_rule_ids.py`. Document false positives and tag the technique.

## 4. Generate and validate

```bash
pnpm content:labs          # writes labs/<domain>/<slug>/README.md
pnpm validate:content      # schema, Sigma, MITRE IDs, scenario ↔ rules, broken links
pnpm test:api              # includes: every lab triggers EXACTLY its declared rules
```

The most important check: **a lab's scenario must trigger exactly the rules it declares.** A missing rule is an error; an undeclared extra rule is a warning to resolve (declare it, or adjust the scenario).

## 5. Try it

```bash
pnpm dev:api & pnpm dev:web
```

Open your lab, click _Start simulation_, then open an alert and step through the lifecycle view. Read your lab as a learner would: do the questions have answers you can find in the telemetry?

## 6. Open a pull request

Use the PR template. Include a screenshot of the lifecycle view for your lab if you can. A maintainer will check safety first, then teaching quality, then details.

## Adding a live container lab

Prefer telemetry labs. If your lab genuinely needs a running target:

- put the service on the internal `lab` network only, with **no published port**;
- run it read-only, non-root, `cap_drop: [ALL]`, `no-new-privileges`, with memory/CPU limits;
- keep all data fake and in memory; no shell, file or outbound-network access in the app;
- have it ship its own access log to `POST /api/v1/events/ingest` (see `labs/web/vulnerable-app/app.py`);
- put it behind a Compose profile and describe the isolation in the lab's `safety` block.

Live-container proposals get extra security review.

## Adding a detection only

Use the _Detection proposal_ issue template, or open a PR adding the rule and, if it warrants one, a near-miss event in `scripts/generate_datasets.py` (then run it) so a test proves the rule stays quiet on benign activity.
