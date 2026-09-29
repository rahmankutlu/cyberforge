# Creating a lab

A lab is a small directory of plain files. You do not need to understand the API or the web app to add one: scaffold it, replace the placeholders, and let the validator tell you when it is right.

**Time:** about an hour for a first lab. **You need:** Node 22, pnpm and Python 3.12 ([Getting started](getting-started.md)).

## The shortest path

```bash
pnpm create:lab web broken-authentication      # or: python -m cyberforge lab create web broken-authentication
```

```text
Created labs/web/broken-authentication/
  lab.yaml
  README.md
  telemetry/scenario.jsonl
  detections/broken-authentication-example.yml
  detections/broken-authentication-example.tests.yml
  tests/lab.tests.yml

✓ The scaffold validates: schema, README, scenario, example rule and its tests.
  43 placeholders marked TODO-REPLACE-ME to replace.
```

The scaffold is a **working lab**. It already validates: the example rule fires on the example telemetry, its tests pass, and the README is generated. Every placeholder says `TODO-REPLACE-ME`, and `pnpm validate:content` (and CI) fails while any remain, so a half-finished lab cannot be merged by accident.

Then:

1. Edit `lab.yaml` (the story and the questions).
2. Replace the three events in `telemetry/scenario.jsonl` with your synthetic telemetry.
3. Replace the example rule in `detections/` and its tests.
4. Check it: `python -m cyberforge lab validate broken-authentication`.
5. Render the README and check everything: `pnpm content:labs && pnpm validate:content`.

Options: `--title "Broken Authentication"`, `--difficulty intermediate`, `--compose` (adds an isolated `docker-compose.yml`, see [Live mode](#optional-live-mode)). Domains: `web`, `api`, `linux`, `windows-sim`, `network`, `cloud`, `ai-security`.

A finished small lab, ready to copy, is in [`examples/custom-lab`](../examples/custom-lab).

## What is in the directory

| File                          | Purpose                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `lab.yaml`                    | The manifest and the source of truth. Validated strictly.                                                |
| `README.md`                   | Rendered from `lab.yaml` by `pnpm content:labs`. Never edit it by hand.                                  |
| `telemetry/scenario.jsonl`    | The synthetic events the lab replays, one JSON object per line.                                          |
| `detections/<rule>.yml`       | Sigma rules that belong to this lab. Optional: a lab may also use shared rules from `detections/sigma/`. |
| `detections/<rule>.tests.yml` | The rule's positive and negative tests, next to the rule ([Testing detections](testing-detections.md)).  |
| `tests/lab.tests.yml`         | What the scenario must and must not trigger.                                                             |
| `docker-compose.yml`          | Optional live mode.                                                                                      |

## The manifest

`lab.yaml` has a JSON Schema at [`schemas/lab.schema.json`](../schemas/lab.schema.json). Editors that understand it (VS Code with the YAML extension) validate and autocomplete as you type; the scaffold's first line already points at it. Unknown keys are errors, so a typo cannot pass silently.

| Concept      | Key                                            | Rule                                                                                                  |
| ------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| id           | `slug`                                         | Lowercase kebab-case. Must equal the directory name.                                                  |
| (order)      | `number`                                       | Unique. The scaffold picks the next free number.                                                      |
| title        | `title`                                        | 3 to 120 characters.                                                                                  |
| description  | `summary`                                      | 20 to 300 characters. Shown on the lab card.                                                          |
| difficulty   | `difficulty`                                   | `beginner`, `intermediate` or `advanced`.                                                             |
| category     | `domain` and `category`                        | `domain` is one of the seven above and must match the parent directory.                               |
| duration     | `duration_minutes`                             | 5 to 480.                                                                                             |
| tags         | `tags`                                         | Free lowercase words.                                                                                 |
| objectives   | `objectives`                                   | At least two things a learner can do afterwards.                                                      |
| mitre        | `mitre`                                        | At least one ATT&CK or ATLAS id. Must exist in the shipped MITRE data.                                |
| telemetry    | `telemetry.sources`, `telemetry.scenario_file` | Each source names its Sigma logsource. The scenario file must exist.                                  |
| detections   | `expected_detection.rules`                     | Rule slugs that **must fire** on the scenario. CI proves it.                                          |
| services     | `architecture.components`, `setup`             | The systems involved and how each is networked (`none`, `lab-internal`, `backend`, `host-localhost`). |
| safe_targets | `safety.allowed_targets`                       | Extra lab hostnames. Each must end in `.lab.internal`.                                                |
| cleanup      | `cleanup`                                      | At least one step. "Nothing to clean up" is a valid answer for a simulation-only lab.                 |

The rest describes the teaching: `scenario` (the story), `attack_simulation` (what the replay shows), `investigation_questions` (each with a hint and an answer), `mitigation` and `references` (at least one).

## The telemetry

One event per line, using the same vocabulary as the rest of CyberForge (see the [telemetry table](detections.md#telemetry-vocabulary)):

```json
{
  "t": 5,
  "category": "web_request",
  "fields": {
    "c-ip": "198.51.100.10",
    "cs-method": "POST",
    "cs-uri-stem": "/login",
    "sc-status": 401
  },
  "note": "Shown in the lifecycle view."
}
```

- `t` is seconds from the start. `repeat` and `every` expand a burst; `{i}` and `{i+N}` in strings are replaced by the repeat index.
- **Everything must be synthetic.** Use RFC 5737 documentation addresses (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`), private ranges and `*.example` or `*.lab.internal` names. Real victim data, real domains and working payloads are not accepted.
- The scenario must trigger the rules in `expected_detection.rules`. Other rules that also fire produce a warning; if that is intended, list them.

## Lab-local detections and tests

Put a rule in `detections/` beside the lab and it is loaded like any shared rule: it appears in the detection list, the playground and the MITRE view. Give it a `<rule>.tests.yml` with at least one positive and one negative case. Then reference it from `expected_detection.rules`.

`tests/lab.tests.yml` adds assertions about the scenario itself:

```yaml
min_events: 5 # the scenario must have at least this many events
must_fire: [sudoers-edit-via-sudo] # in addition to lab.yaml
must_not_fire: [linux-sudo-spawns-root-shell] # rules that must stay quiet on this scenario
```

`must_not_fire` is how you prove a near miss: the "normal" part of your scenario must not trip a rule that looks similar.

## Validation

```bash
python -m cyberforge lab validate <slug>   # one lab: schema, README, scenario, rules, tests, placeholders
pnpm validate:content                      # everything, including links and MITRE ids
pnpm test:detections                       # every rule's tests
```

The checks include: the manifest matches its schema; the README exists; the scenario file loads and every category is known; declared rules exist and fire; tests pass; ATT&CK ids exist; no `TODO-REPLACE-ME` remains.

## Optional live mode

Most labs are **simulation only**: nothing runs, the telemetry is replayed. A lab may add a deliberately vulnerable container. `--compose` writes an isolated starting point:

- one internal network with no route to the internet,
- the only published port bound to `127.0.0.1`,
- a read-only filesystem, no new privileges, all capabilities dropped, and a compose profile so it never starts by default.

Set `setup.requires_containers: true`, `setup.compose_profile: labs` and `safety.scope: local-container` in `lab.yaml`. The rules in the [security model](security-model.md) apply: no arbitrary targets, no real credentials, nothing that can reach a public host.

## Submitting

Open a pull request with the whole directory. CI runs content validation and the detection tests. A checklist for reviewers is in the pull request template; ideas that are ready to build are in the [contributor backlog](contributor-backlog.md).
