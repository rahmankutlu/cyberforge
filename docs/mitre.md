# MITRE ATT&CK integration

CyberForge maps labs, detection rules, alerts and investigations to MITRE techniques, and shows the coverage that results.

## Where the data comes from

`mitre/attack.json` and `mitre/atlas.json` are **generated**, never hand-edited:

```bash
pnpm content:mitre        # python scripts/build_mitre_data.py
```

The script reads the official releases (ATT&CK Enterprise STIX 2.1 from `mitre-attack/attack-stix-data`, and ATLAS from `mitre-atlas/atlas-data`), keeps **only the identifiers listed in [`mitre/curated.yaml`](../mitre/curated.yaml)**, and copies names, tactics, descriptions (first paragraph, cleaned), platforms, URLs and up to four official mitigations per technique.

It **exits with an error if any curated identifier is missing upstream or deprecated**, and if a curated sub-technique lacks its parent. That is how CyberForge guarantees it never ships an invented technique ID. This is not theoretical: building against the current data caught identifiers that had been retired (T1562 _Impair Defenses_ and T1070.001 _Clear Windows Event Logs_ are now T1685 _Disable or Modify Tools_ and T1685.005), and a tactic split (Defense Evasion is now **Stealth** and **Defense Impairment**).

Current dataset: ATT&CK Enterprise **v19.2** (15 tactics, 90 curated techniques) and MITRE ATLAS **v5.6.0** (8 tactics, 14 curated techniques). The versions are shown in the explorer header and in Settings.

### Updating

1. Add or remove identifiers in `mitre/curated.yaml`.
2. `pnpm content:mitre` (downloads the data; add `--attack-file` / `--atlas-file` to use local copies).
3. `pnpm validate:content`. Any lab, rule or learning module that references a removed identifier fails with a precise message.

## Why a curated subset?

The full ATT&CK matrix has hundreds of techniques; a coverage map of 500 mostly-empty cells hides what is real. CyberForge curates the techniques its labs and rules touch, plus neighbours worth teaching. Contributors add to the list as they add content.

## How coverage is computed

For each technique CyberForge counts, from live data:

| Count              | Meaning                                           |
| ------------------ | ------------------------------------------------- |
| **Labs**           | Labs whose `mitre` list contains it.              |
| **Rules**          | Enabled detection rules tagged with it.           |
| **Alerts**         | Alerts whose primary technique it is.             |
| **Investigations** | Distinct investigations that contain such alerts. |

**Sub-techniques roll up into their parent**, so a parent's counts are the union of everything beneath it. "Covered" means at least one enabled rule. That is a floor, not a grade: a covered cell means _a_ rule exists. Look at the rule's level, freshness and documented false positives before believing it.

## The explorer (`/mitre`)

- **Coverage map:** a heatmap by tactic column, switchable between rules, labs, alerts and investigations; optionally with sub-techniques.
- **Detection coverage:** coverage by tactic and the list of **gaps** (techniques with no rule), which is where to write the next detection.
- **Techniques:** a sortable, filterable table.
- **Tactics:** cards with descriptions and coverage.
- **Technique pages** (`/mitre/T1059.001`): description, platforms, mapped labs and rules, recent alerts, sub-techniques and MITRE's mitigations.

## ATT&CK and ATLAS

ATT&CK covers conventional intrusions. **MITRE ATLAS** covers attacks on AI systems (prompt injection `AML.T0051`, RAG poisoning `AML.T0070`, agent tool invocation `AML.T0053`, …) and is what the AI labs map to. Toggle between them at the top of the explorer. Sigma tags for ATLAS use `atlas.aml.tNNNN[.NNN]`; CyberForge's own convention, since Sigma has no standard ATLAS namespace.

## Attribution

MITRE ATT&CK® is a registered trademark of The MITRE Corporation. MITRE ATLAS™ is a trademark of The MITRE Corporation. ATT&CK content is used under the [ATT&CK Terms of Use](https://attack.mitre.org/resources/terms-of-use/); see [NOTICE.md](../NOTICE.md). CyberForge is an independent project and is not affiliated with or endorsed by MITRE.
