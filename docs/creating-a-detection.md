# Creating a detection

The shortest path from an idea to a merged Sigma rule. You do not need to understand the rest of the codebase: a rule is two small YAML files.

**Time:** about 15 minutes. **You need:** Node 22, pnpm and Python 3.12 (see [Getting started](getting-started.md)), or just an editor and the playground (`/detections/playground`) to draft the rule.

## 1. Pick something you can explain

Good first rules detect one clear behaviour on one log source: _a shell spawned by a web server_, _a cron file written by an interpreter_, _sudo used to open a root shell_. Check the detections list (`/detections`) first so you do not duplicate an existing rule, and browse the [telemetry vocabulary](detections.md#telemetry-vocabulary) for the field names available.

## 2. Write the rule

Create `detections/sigma/<area>/<slug>.yml`. The file name is the slug: lowercase, hyphenated, prefixed by platform (`win-`, `linux-`, `web-`, `cloud-`, `dns-`, `ai-`).

```yaml
title: Interpreter Writes To A Cron Directory
id: 00000000-0000-0000-0000-000000000000 # placeholder; step 4 assigns a real one
status: experimental
description: >
  Detects a script interpreter writing into a system cron directory. Cron files are a common
  persistence location, and legitimate changes normally come from the package manager.
references:
  - https://attack.mitre.org/techniques/T1053/003/
author: Your Name
date: 2026-09-29
tags:
  - attack.t1053.003
logsource:
  category: file_event
  product: linux
detection:
  selection:
    Operation: write
    TargetFilename|startswith: /etc/cron
    Image|endswith: [/bash, /sh, /python3, /perl]
  condition: selection
falsepositives:
  - Configuration management tools that template cron files
level: medium
```

Rules of thumb:

- **One primary technique.** The first `attack.t…` tag is the alert's technique. Identifiers must exist in the shipped MITRE data (`pnpm validate:content` tells you if not).
- **Say what benign activity looks like.** `falsepositives` is required in spirit: an analyst who cannot tell noise from signal will disable the rule.
- **Use the field names in the telemetry vocabulary.** A rule that reads a field no event has will never fire, and the tests will tell you.
- **Use `filter_*` selections** for known-good exclusions, and `condition: selection and not filter_x`.

## 3. Write the tests

Create `<slug>.tests.yml` next to the rule. Start with one positive, one near-miss negative, and one negative per filter:

```yaml
tests:
  - name: detects bash writing a cron file
    event:
      Operation: write
      TargetFilename: /etc/cron.d/updater
      Image: /bin/bash
    expected: true

  - name: ignores the package manager writing a cron file
    event:
      Operation: write
      TargetFilename: /etc/cron.d/logrotate
      Image: /usr/bin/dpkg
    expected: false
```

All the options, including multiple events and correlation rules, are in [Testing detections](testing-detections.md).

## 4. Run it

```bash
python scripts/assign_rule_ids.py     # gives the rule a stable UUID
pnpm test:detections                  # runs every rule's tests
pnpm validate:content                 # schemas, MITRE ids, links, and the tests again
```

While iterating, open the playground (`/detections/playground`), paste the rule and your event, and use **Match trace** to see which selection matched or failed and why. Then run only your rule:

```bash
python -m cyberforge detections test --rule linux-interpreter-writes-cron-file
python -m cyberforge detections quality      # your rule should score 7/7
```

## 5. Open the pull request

The **Detection tests** check runs the same command you did. It fails if the rule or tests are invalid, a positive test does not match, a negative test matches, a MITRE id is unknown, or the rule has no positive and negative test.

Prefer to start smaller? Every rule under `detections/sigma/` welcomes more tests, and the [contributor backlog](contributor-backlog.md) lists rules, datasets, labs and stories that are ready to pick up.

## Correlation rules

Counting and sequence rules put the base rule (with a `name:`) and the correlation rule in one file, separated by `---`. See [`win-failed-logon-burst.yml`](../detections/sigma/windows/win-failed-logon-burst.yml) and its tests for the pattern.
