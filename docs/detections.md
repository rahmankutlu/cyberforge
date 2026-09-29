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

`/detections/playground` (and `POST /api/v1/detections/{validate,translate,test}`):

- **Validate** reports syntax and condition errors, pySigma lint warnings, the fields the rule reads, its logsource, MITRE identifiers (flagging any not in CyberForge's dataset), and the documented false positives. YARA and Suricata rules are validated for syntax/structure.
- **Translate** produces Elastic (Lucene), Splunk SPL, Microsoft Sentinel (KQL), OpenSearch (Lucene) and a generic SQL-like form. Field names are passed through unchanged because the correct field mapping depends on your data model (ECS, CIM, ASIM…); apply the matching [pySigma processing pipeline](https://sigmahq.io/docs/digging-deeper/pipelines.html) before running a query in production. Some backends do not support every construct (notably correlations); the response says which and why instead of failing.
- **Test** runs the real engine against custom JSON events (each may name a `category`) or a lab scenario, and shows which events matched, the matched fields and patterns, and correlation hits.

## Writing a good detection

1. **Start from behaviour, not a string.** A parent-child relationship or a distinct-count usually outlives any single command line.
2. **Say what you exclude.** A filter with a comment beats an unexplained threshold.
3. **Pick the right window and grouping** for correlations. `group-by` defines "the same actor"; `timespan` should match how fast the behaviour happens.
4. **Document false positives** honestly and add a near-miss event to a dataset so the tests prove the rule stays quiet.
5. **Map to the most specific technique** and put it first in `tags`.
6. **Test both ways:** the rule fires on the lab scenario, and does not on `datasets/**` baselines. `pnpm validate:content` and the API tests enforce the first; add to the second when you add a near-miss.

## YARA and Suricata

YARA rules are one rule per `.yar` file with `meta` (`title`, `description`, `severity`, `mitre_attack`, `false_positives`). Suricata rules are one per line in `detections/suricata/*.rules` with `metadata:mitre_technique_id Txxxx, severity …;` and a `sid` in CyberForge's reserved range `9000000-9000099`. They are documented and validated but not executed by the in-app engine; run them with YARA and Suricata themselves.
