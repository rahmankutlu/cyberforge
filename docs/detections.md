# Detections

CyberForge ships a small but real detection library and the tooling to write more.

| Format       | Count | Where                          | How it is used                                                            |
| ------------ | ----: | ------------------------------ | ------------------------------------------------------------------------- |
| **Sigma**    |    55 | `detections/sigma/<platform>/` | Validated, translated, **evaluated** against events, and mapped to MITRE. |
| **YARA**     |     5 | `detections/yara/`             | Syntax-validated (plyara), mapped to MITRE, documented.                   |
| **Suricata** |     5 | `detections/suricata/`         | Structure-validated, mapped to MITRE, documented.                         |

Sigma is the focus: it is the only format the engine executes, and 10 of the rules are correlations (each shipped in one file with its base rule). Every rule states what it detects, why, its false positives, references, and its ATT&CK tags.

## Anatomy of a rule

```yaml
title: PowerShell Launched With Encoded Command
id: 5e87ab79-2ddb-5491-a59b-92c36bf1e26b
status: stable
description: >
  Detects PowerShell started with an encoded command argument …
references:
  - https://attack.mitre.org/techniques/T1059/001/
author: CyberForge
date: 2026-09-01
tags:
  - attack.t1059.001 # the FIRST technique tag is the alert's primary technique
  - attack.t1027.010
logsource:
  category: process_creation
  product: windows
detection:
  selection_image:
    - Image|endswith: ['\powershell.exe', '\pwsh.exe']
    - OriginalFileName: ["PowerShell.EXE", "pwsh.dll"]
  selection_flag:
    CommandLine|contains: [" -enc ", " -EncodedCommand ", " -ec "]
  filter_management:
    ParentImage|endswith: '\CcmExec.exe'
  condition: selection_image and selection_flag and not filter_management
falsepositives:
  - Endpoint management and software deployment agents
level: high
```

- **Files:** one rule per file; the file name is the slug (`win-encoded-powershell-command`). A correlation file holds base rules (with `name:`) and the correlation rule as YAML documents separated by `---`.
- **Ids:** run `python scripts/assign_rule_ids.py` after adding a rule with the placeholder id `00000000-0000-0000-0000-000000000000`; it assigns a stable UUIDv5.
- **MITRE tags:** `attack.tNNNN[.NNN]` for ATT&CK; `atlas.aml.tNNNN[.NNN]` for ATLAS (CyberForge's convention). Identifiers must exist in the shipped data.
- **Tactics** are derived from the technique, not from tactic tags: ATT&CK v19 renamed and split some tactics (Defense Evasion became Stealth and Defense Impairment).

## The engine

Rules are parsed by pySigma; CyberForge evaluates the resolved condition tree.

- **Supported:** every value type pySigma produces (strings with wildcards, case-sensitive strings, numbers, booleans, null, regular expressions, CIDR, comparisons, `exists`, field references, expansions), `and`/`or`/`not`, `1 of selection_*`, `all of them`, keyword search, list-valued fields (any element matches), dotted/nested field lookup.
- **Logsource matching:** a rule only runs against events whose logsource is compatible (`category`, `product`, `service`). A Windows rule never sees a Linux log.
- **Correlation:** `event_count`, `value_count`, `temporal`, `temporal_ordered`, with `timespan` windows, `group-by`, and `gte`/`gt`/`lte`/`lt`/`eq`. Non-overlapping windows produce one hit per burst.
- **Not supported (rejected, not silently ignored):** rules with several conditions, extended correlation conditions and aggregation types beyond those above.
- **Safety:** rule size is capped at 64 KiB, playground events at 500, and the playground/translate endpoints are rate-limited.

## Telemetry vocabulary

Events use Sigma's field names. Each category fixes a logsource and a raw-log renderer:

| Category            | Source (raw format) | Logsource                  | Key fields                                                                                        |
| ------------------- | ------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| `process_creation`  | Sysmon EID 1 (JSON) | windows / process_creation | `Image`, `CommandLine`, `ParentImage`, `OriginalFileName`, `IntegrityLevel`                       |
| `process_access`    | Sysmon EID 10       | windows / process_access   | `SourceImage`, `TargetImage`, `GrantedAccess`                                                     |
| `file_event`        | Sysmon EID 11       | windows / file_event       | `Image`, `TargetFilename`                                                                         |
| `registry_set`      | Sysmon EID 13       | windows / registry_set     | `TargetObject`, `Details`, `Image`                                                                |
| `ps_script`         | PowerShell 4104     | windows / ps_script        | `ScriptBlockText`                                                                                 |
| `windows_security`  | Security log        | windows / security         | `EventID`, `TargetUserName`, `IpAddress`, `LogonType`, `TaskContent`, `MemberName`                |
| `windows_system`    | System log          | windows / system           | `EventID`, `ServiceName`, `ImagePath`                                                             |
| `linux_auth`        | syslog auth.log     | linux / auth               | `Program`, `Message`, `SrcIP`                                                                     |
| `linux_process`     | auditd EXECVE       | linux / process_creation   | `Image`, `CommandLine`, `ParentImage`                                                             |
| `linux_file_event`  | auditd PATH         | linux / file_event         | `Operation`, `TargetFilename`, `Image`                                                            |
| `dns_query`         | BIND query log      | dns                        | `query`, `record_type`, `rcode`, `src_ip`                                                         |
| `firewall`          | iptables-style      | firewall                   | `src_ip`, `dst_ip`, `dst_port`, `action`                                                          |
| `web_request`       | Apache combined     | webserver                  | `c-ip`, `cs-method`, `cs-uri-stem`, `cs-uri-query`, `sc-status`, `cs-user-agent`, `jwt_alg`       |
| `cloud_audit`       | CloudTrail (JSON)   | aws / cloudtrail           | `eventName`, `eventSource`, `userIdentity.*`, `requestParameters.*`, `geo.country`                |
| `ai_gateway`        | AI gateway (JSON)   | cyberforge / ai_gateway    | `agent`, `event_type`, `prompt`, `retrieved_content`, `tool_name`, `tool_args`, `guardrail_flags` |
| `container_runtime` | container audit     | docker / runtime           | `Image`, `Privileged`, `Mounts`                                                                   |

Nested JSON (CloudTrail) is flattened to dotted keys (`userIdentity.arn`) for matching and re-nested in the raw view.

## The playground

`/detections/playground` is a three-pane tool for writing a rule, running it over realistic telemetry and understanding the result.

|            | Pane                             | What it does                                                                                                                        |
| ---------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Left**   | Rule, Notes                      | Edit Sigma, YARA or Suricata. Run with the button or `Ctrl/⌘ + Enter`. Notes shows the description, false positives and references. |
| **Centre** | Test Data                        | Pick a curated dataset (or paste custom events), filter matched and unmatched items, move with the arrow keys.                      |
| **Right**  | Match Trace, Translations, MITRE | Explains the selected event, translates the rule, and shows its ATT&CK mapping.                                                     |

### Match trace

For any event, matched or not, the trace answers _why_:

- **Why it matched:** each selector, the field, the operator and rule value that hit, and the event's actual value (highlighted).
- **Selections:** every named selection with a ✓ or ✗, every value that was checked, and alternatives for list-of-maps selections. Exclusion filters are labelled.
- **Condition:** the condition as written and an indented evaluation path (`selection_image AND selection_flag AND NOT filter_management`), then the result.
- **Logsource:** whether the event's source was compatible with the rule.
- **False-positive hints:** the rule's documented false positives and which exclusions did or did not apply.

The trace is produced from the same pySigma objects and matching functions as the engine, and a test checks that it never disagrees with a real match. For correlation rules it shows the window, grouping, hits and which events are members.

### Datasets

Eleven curated, synthetic datasets in `datasets/playground/*.yaml`. Each lists its name, description, source type, event count, MITRE relevance, the rules it is **expected to trigger** (checked in CI), and things to try:

| Dataset                          | Source                        | Try it with                                                              |
| -------------------------------- | ----------------------------- | ------------------------------------------------------------------------ |
| Windows process execution        | Sysmon EID 1                  | Office spawning shells, certutil downloads, WMI, LSASS dump command line |
| Authentication failures          | Windows Security 4624/4625    | Brute-force burst, password spraying, RDP from a public address          |
| DNS anomalies                    | Resolver query log            | NXDOMAIN bursts, random subdomains, encoded TXT labels, Suricata 9000003 |
| HTTP access logs                 | Web access log                | SQLi, XSS, scanners, exposed files, credential stuffing, enumeration     |
| Linux auth logs                  | auth.log                      | SSH brute force then login, new user, sudo root shell                    |
| Cloud audit logs                 | CloudTrail                    | Root login, foreign login, key for another user, public bucket           |
| Suspicious PowerShell simulation | Sysmon + script-block logging | Encoded command, download cradle, decode-and-execute, Run key            |
| Web shell telemetry              | IIS log + Sysmon              | Request, file write and process chain for one intrusion                  |
| Admin account creation           | Windows, Linux, CloudTrail    | The same goal in three logs                                              |
| Lateral movement simulation      | Sysmon, Security, System      | WMI, service and scheduled-task persistence                              |
| File samples for YARA            | Synthetic files               | The five shipped YARA rules                                              |

To add one, see the [contributor backlog](contributor-backlog.md) and copy an existing file; `pnpm validate:content` fails if a dataset does not trigger the rules it lists.

### Sigma, YARA and Suricata

- **Sigma** runs on the real engine, including correlations.
- **YARA** runs on a small teaching evaluator (no libyara): text and regex strings with `nocase`, `wide`, `ascii` and `fullword`, `filesize`, integer reads such as `uint32be(0)`, `and`/`or`/`not` and `any|all|N of`. Hex strings, modules and loops are reported as unsupported rather than guessed.
- **Suricata** shows a structured breakdown of the rule and previews `content`, `pcre`, `nocase`, `startswith` and `endswith` against HTTP and DNS telemetry (URI, user agent, method, DNS query). Options that need packets or state (`flags`, `threshold`, `flow`) are listed as not evaluated.

### Translation pipelines

A Sigma rule uses the field names of its log source (`CommandLine`, `Image`). Your SIEM stores the same data under its own schema: `process.command_line` in ECS, `TargetProcessCommandLine` in Sentinel's ASIM. A **processing pipeline** renames the fields (and picks the table, index or sourcetype) before the query is generated.

| Target              | Pipelines                                         | `auto` tries                                      |
| ------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Elastic, OpenSearch | `ecs_windows`                                     | `ecs_windows`                                     |
| Splunk              | `splunk_windows`, `splunk_cim`                    | `splunk_windows`                                  |
| Microsoft Sentinel  | `sentinel_asim`, `azure_monitor`, `microsoft_xdr` | `sentinel_asim`, `azure_monitor`, `microsoft_xdr` |
| SQL-like            | none                                              | none                                              |

Each target accepts `none`, `auto` or one pipeline id. In the playground the picker sits above each query and defaults to `auto`; through the API the default is `none`, so existing clients get exactly the output they got before.

- **`auto`** tries the target's pipelines in order and keeps the first that translates the rule and changes something. If none does, you get the unmapped query and the reason, never a wrong guess.
- **The mapping table** lists every rule field with what it became, the fields a pipeline added (for example `winlog.channel`) and any it dropped.
- **Honest limits.** The shipped pipelines cover the Windows and Sysmon families. A rule for another log source (cloud, web, Linux) falls back to the unmapped query with a note saying so. `splunk_cim` is opt-in because it only covers process, file and registry events.

```http
POST /api/v1/detections/translate
{"content": "<sigma yaml>", "targets": ["elastic", "sentinel"], "pipelines": {"elastic": "auto", "sentinel": "azure_monitor"}}
```

An unknown pipeline id is a `422`. The response adds `pipeline`, `pipeline_label`, `field_changes`, `added_fields`, `dropped_fields` and `pipeline_error` to each translation; the change is additive, so it is a minor release under [Versioning](versioning.md).

### API

`GET /api/v1/playground/datasets`, `GET /api/v1/playground/datasets/{slug}`, `POST /api/v1/playground/run` and `POST /api/v1/playground/explain`; plus the existing `POST /api/v1/detections/{validate,translate,test}` and `GET /api/v1/detections/translate/pipelines`. Translations are generated by pySigma for Elastic (Lucene), Splunk SPL, Microsoft Sentinel (KQL) and OpenSearch, plus a generic SQL-like form. Choose a [processing pipeline](#translation-pipelines) to map field names to your data model (ECS, Splunk, ASIM…) before you run a query in production. Some backends do not support every construct (notably correlations); the response says which and why instead of failing.

## Writing a good detection

1. **Start from behaviour, not a string.** A parent-child relationship or a distinct-count usually outlives any single command line.
2. **Say what you exclude.** A filter with a comment beats an unexplained threshold.
3. **Pick the right window and grouping** for correlations. `group-by` defines "the same actor"; `timespan` should match how fast the behaviour happens.
4. **Document false positives** honestly and add a near-miss event to a dataset so the tests prove the rule stays quiet.
5. **Map to the most specific technique** and put it first in `tags`.
6. **Test both ways:** ship a `<slug>.tests.yml` with events that must match and events that must not ([Testing detections](testing-detections.md)); the rule also fires on its lab scenario and does not on `datasets/**` baselines. `pnpm test:detections` and `pnpm validate:content` enforce it.

## YARA and Suricata

YARA rules are one rule per `.yar` file with `meta` (`title`, `description`, `severity`, `mitre_attack`, `false_positives`). Suricata rules are one per line in `detections/suricata/*.rules` with `metadata:mitre_technique_id Txxxx, severity …;` and a `sid` in CyberForge's reserved range `9000000-9000099`. They are validated, and previewed in the playground with the teaching evaluators described above; run them with YARA and Suricata themselves for real scanning.
