# Testing detections

Every Sigma rule in CyberForge ships with tests: events that **must** match and events that **must not**. They live next to the rule, run in a second, and gate every pull request.

```bash
pnpm test:detections
```

```text
✓ win-encoded-powershell-command
  ✓ detects encoded PowerShell
  ✓ detects the long -EncodedCommand flag in PowerShell 7
  ✓ ignores normal PowerShell administration
  ✓ ignores encoded PowerShell started by the endpoint-management agent
✓ linux-ssh-brute-force-burst
  ✓ detects eight failed SSH passwords from one source within two minutes
  ✓ ignores seven failures, one short of the threshold
...
55 rules
199 tests
0 failures
Detection test coverage: 55/55 rules (100%)
```

The tests use the **same engine** the SOC and the playground (`/detections/playground`) use, so a green test means the rule really fires (or stays quiet) in CyberForge.

## Where the tests go

Next to the rule, with `.tests.yml` in place of `.yml`:

```text
detections/sigma/windows/win-encoded-powershell-command.yml
detections/sigma/windows/win-encoded-powershell-command.tests.yml
```

A rule that lives in its own directory uses `rule.yml` and `tests.yml` (see [`examples/custom-detection`](../examples/custom-detection)):

```text
detections/sigma/windows/win-my-rule/rule.yml
detections/sigma/windows/win-my-rule/tests.yml
```

A tests file without a rule is an error (usually a renamed rule).

## The format

```yaml
tests:
  - name: detects encoded PowerShell
    event:
      Image: 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
      CommandLine: "powershell.exe -nop -w hidden -enc VwByAGkAdABlAC0ATwB1AHQAcAB1AHQA "
    expected: true

  - name: ignores normal PowerShell
    event:
      Image: 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
      CommandLine: "powershell.exe Get-Process"
    expected: false
```

| Key           | Meaning                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `name`        | Unique within the file. Write it as a sentence: _detects…_ or _ignores…_.                         |
| `event`       | One event, as flat fields in the [Sigma field vocabulary](detections.md#telemetry-vocabulary).    |
| `events`      | Several events (see below). Use exactly one of `event` and `events`.                              |
| `expected`    | `true`: the rule must fire. `false`: it must stay quiet.                                          |
| `matches`     | Optional. The exact 0-based indexes of the events that must match (single-event rules).           |
| `hits`        | Optional. The exact number of correlation hits (correlation rules).                               |
| `category`    | Optional. A telemetry category such as `dns_query`; picks the logsource. Default: the rule's own. |
| `description` | Optional free text.                                                                               |

Unknown keys are rejected, so a typo (`expcted:`) fails loudly instead of silently testing nothing.

### Nested fields

CloudTrail-style fields can be nested or dotted; both work:

```yaml
event:
  eventName: ConsoleLogin
  userIdentity: { type: Root }
```

### Several events and correlation rules

`events` takes a list. Each item has a time offset `t` (seconds, default 0), optional `repeat` and `every` to expand a burst, and its `fields`. Inside string values `{i}` is the repeat index and `{i+N}` / `{i*N}` do simple arithmetic.

```yaml
tests:
  - name: detects eight failed SSH passwords from one source within two minutes
    events:
      - repeat: 8
        every: 5
        fields:
          Program: sshd
          SrcIP: 203.0.113.50
          Message: "Failed password for root from 203.0.113.50 port {i+40000} ssh2"
    expected: true
    hits: 1

  - name: ignores seven failures, one short of the threshold
    events:
      - repeat: 7
        every: 5
        fields: { Program: sshd, SrcIP: 203.0.113.50, Message: "Failed password for root" }
    expected: false
```

Sequence rules (`temporal_ordered`) are tested by giving each step its own `t`; see `win-local-admin-account-created.tests.yml`.

## What makes a good test set

A rule is counted as **tested** when it has at least one positive and one negative case. Aim higher:

1. **A realistic positive.** Copy a line from a lab's `telemetry/scenario.jsonl` so the test reflects what the rule is for.
2. **A near miss.** The most valuable negative differs from the positive in exactly the field your rule keys on: `Get-Process` instead of `-enc`, the same command from an expected parent, seven failures instead of eight.
3. **Every filter.** If the rule has `filter_*` selections, add one negative per filter so nobody can delete a filter by accident.
4. **Boundaries.** For thresholds: one at the threshold, one below. For windows: one that falls outside.
5. **Wrong logsource.** Optional, but `category: dns_query` on a process rule proves the logsource gate.

Do not encode a rule's known blind spots as negatives you are happy with. If a real evasion exists, document it in the rule's `falsepositives` or `description` instead.

## CLI

```bash
pnpm test:detections                                   # everything; also requires tests for every rule
python -m cyberforge detections test                   # everything, without the coverage requirement
python -m cyberforge detections test --rule win-security-log-cleared
python -m cyberforge detections test --json            # machine-readable
python -m cyberforge detections quality                # seven checks per rule
```

The exit status is non-zero when any test fails, a tests file is invalid, a rule does not load, or (with `--require-tests`, which `pnpm test:detections` and CI use) a Sigma rule lacks a positive and a negative test.

`pnpm validate:content` runs the same tests as part of full content validation.

## Coverage and quality

Coverage is calculated from the repository on every run; nothing is hard-coded:

```text
Detection test coverage: 55/55 rules (100%)
```

It counts Sigma rules only, because Sigma is the format CyberForge can execute. YARA and Suricata rules are validated for structure but not yet unit-tested.

Beyond coverage, each Sigma rule gets seven deterministic checks. These are yes/no facts, not a score:

| Check                    | Passes when                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Schema valid             | pySigma parses the rule with no errors.                                                                                |
| MITRE mapped             | At least one ATT&CK/ATLAS tag, and every tag is a technique in the shipped dataset.                                    |
| Has description          | `description` is not empty.                                                                                            |
| Has false-positive notes | `falsepositives` lists benign activity that looks like a match.                                                        |
| Has positive tests       | The tests file has at least one case with `expected: true`.                                                            |
| Has negative tests       | ... and at least one with `expected: false`.                                                                           |
| Translation verified     | The rule translates to at least one SIEM backend, and every backend that refuses does so with a clear "not supported". |

They appear on each rule's page and in `python -m cyberforge detections quality`. For example, the two `temporal_ordered` correlations score 6/7 today because no bundled backend can express ordered sequences: an honest result, not a bug.

## In CI

The **Detection tests** job runs `pnpm test:detections` on every pull request. A pull request that adds or changes a rule fails when:

- the rule's schema is invalid or it cannot be compiled,
- the tests file is invalid (unknown key, missing `expected`, duplicate name, unknown category),
- a positive test does not match, or a negative test matches,
- a MITRE identifier does not exist in the dataset,
- the rule has no positive and negative test.

Failures show as inline annotations on the tests file and in the job summary, together with the coverage table.
