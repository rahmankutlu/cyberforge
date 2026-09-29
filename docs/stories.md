# Attack stories

A story is a complete, synthetic attack-and-defence narrative you investigate in time order: from the first odd log line to the lessons learned. Where a [lab](labs.md) teaches one technique, a story teaches how techniques chain together and what an analyst decides along the way.

Open `/stories`, pick one, and work through it:

```text
Telemetry → Detections → Alerts → MITRE techniques → Analyst decisions → Containment → Lessons learned
```

The strip at the top of every story counts each stage as you reveal steps.

## The five launch stories

| Story                                                                                          | Domain      | Level        | Real detections it uses                                                                                    |
| ---------------------------------------------------------------------------------------------- | ----------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| [Compromised Developer Workstation](../stories/compromised-developer-workstation.yaml)         | Endpoint    | Intermediate | Public RDP logon, encoded PowerShell, download cradle, LSASS, SMB shares, Run key, scheduled task          |
| [Suspicious Admin Account Activity](../stories/suspicious-admin-account-activity.yaml)         | Cloud       | Beginner     | Foreign console login, key for another user, admin policy, public bucket, logging disabled                 |
| [Web Application Intrusion](../stories/web-application-intrusion.yaml)                         | Web         | Intermediate | Scanner, SQL injection, login burst, web shell file, command parameter, web server spawns shell, certutil  |
| [Credential Abuse and Lateral Movement](../stories/credential-abuse-and-lateral-movement.yaml) | Identity    | Advanced     | Password spray, public RDP, LSASS, WMI shell, service from a writable path, new administrator, log cleared |
| [AI Agent Tool Abuse](../stories/ai-agent-tool-abuse.yaml)                                     | AI security | Intermediate | Untrusted ingest and retrieval, tool off the allow-list, secrets read, outbound transfer, canary leak      |

Every detection in a story is a shipped rule, evaluated by the same engine as the SOC over the story's own telemetry. If a story says a rule fires at 08:47, CI has proved it does.

## How a story plays

- **Reveal.** Only the first step is visible. _Reveal next event_ adds the following one. Each step brings its telemetry, evidence, the detections that fired, the alert and the ATT&CK techniques.
- **Mark findings.** Flag the evidence that changes your mind. The board keeps a list and, when you mark something, explains why it matters.
- **Answer questions.** Each answer is explained, right or wrong. Wrong answers lock so the explanation stays visible.
- **Make decisions.** A decision is final. You get feedback on its quality and see the stronger option.
- **The graph.** An investigation graph grows with the story: users, hosts, processes, IPs, domains, detections, alerts and techniques, joined by _executed_, _connected to_, _triggered_, _mapped to_ and _associated with_. A text version lists every relationship.
- **Contain.** After the last step, choose containment actions. Some are recommended, some optional, some harmful; you see which after you submit.
- **Post-incident.** The attack chain by tactic and technique, root cause, what worked, what to improve, detections to add and lessons learned. A short review counts your findings, answers and decisions. It is not a grade.

Progress is stored in your browser only (`localStorage`); there is no account and nothing is uploaded.

## Writing a story

A story is one file, `stories/<slug>.yaml`. The schema lives in [`apps/api/cyberforge/content/stories.py`](../apps/api/cyberforge/content/stories.py). The shape:

```yaml
slug: my-story # must match the file name
title: My Story
summary: One or two sentences that make someone want to open it.
difficulty: beginner # beginner | intermediate | advanced
duration_minutes: 20
domain: endpoint # endpoint | identity | web | network | cloud | ai-security
briefing: The ticket the analyst starts from.
attack_chain: # the attacker's view, revealed at the end
  - {
      tactic: Execution,
      technique: T1059.001,
      step: first-step,
      description: What the attacker did.,
    }
steps:
  - id: first-step
    time: "09:10" # clock time; telemetry offsets are seconds after it
    title: Something odd
    narrative: What the analyst sees at this point.
    telemetry: # same shape as a lab scenario line
      - t: 5
        category: process_creation
        host: WKS-01
        fields: { Image: 'C:\Windows\System32\cmd.exe', CommandLine: "cmd.exe /c whoami" }
        note: What to notice.
    evidence:
      - {
          id: cmd,
          title: The command line,
          kind: log,
          significance: key,
          content: "…",
          finding: Why it matters.,
        }
    detections: [win-some-rule] # must fire on this step's telemetry
    alert: { title: Suspicious thing, severity: high, rule: win-some-rule }
    techniques: [T1059.001]
    questions: [] # optional
    decision: null # optional
    graph_nodes: [] # optional: {id, type, label, ref}
    graph_edges: [] # optional: {source, target, relation}
containment: [] # at least four; at least one `recommended`
postmortem: {} # summary, root_cause, what_worked, what_to_improve, lessons
```

Then:

```bash
python -m cyberforge story validate
```

`story validate` (and `pnpm validate:content`, and CI) checks, among others:

- the schema is followed and no key is misspelled;
- step times never go backwards; ids are unique;
- every technique is in the shipped MITRE data;
- **every rule a step declares really fires on that step's telemetry** (correlation rules see earlier steps too);
- single-answer questions have exactly one correct option; every decision has a best option; containment has a recommended action;
- graph edges only join nodes defined by the same or an earlier step; detection and technique nodes point at real rules and techniques;
- **everything is synthetic**: IPv4 addresses must be private or in the RFC 5737 documentation ranges, and URLs must use `*.example`, `*.lab.internal` or `example.com/org/net`.

Ideas that are ready to write are in the [contributor backlog](contributor-backlog.md).

## Design notes

Stories are file-driven on purpose: they are reviewable diffs, they need no migration, and their detections are proved by the same test suite as everything else. The API (`GET /api/v1/stories`, `GET /api/v1/stories/{slug}`) serves them read-only, computing the fired detections on load. There is no server-side "story run": progress is a small JSON document per story in the learner's browser.
