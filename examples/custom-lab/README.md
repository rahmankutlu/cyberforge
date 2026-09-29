<!-- Generated from lab.yaml by `pnpm content:labs`. Edit lab.yaml, not this file. -->

# Lab 900 - Sudoers Edit Detection

**Beginner** · 20 min · Privilege Escalation · `linux` · MITRE: `T1548.003`

A user edits the sudoers file through sudo. See what the auth log records and write the detection that separates it from everyday sudo use.

## Objectives
- Explain why editing the sudoers file is a common step in gaining lasting root access.
- Recognise a sudoers edit in a Linux authentication log.
- Read the lab's Sigma rule and its tests, and say why each negative test exists.

## Scenario
An engineer's account is used to run a series of ordinary administrative commands. Partway through, the same account opens the sudoers file in an editor. Your job is to find that line among the routine ones and decide whether it needs a human's attention.

## Architecture
A single Linux host writes sudo and sshd events to auth.log. CyberForge replays those events as synthetic telemetry; nothing runs on your machine and nothing is scanned.

| Component | Role | Network |
| --- | --- | --- |
| app-host-01 | Linux host whose auth.log is replayed | `none` |

## Lab setup

1. Press Run simulation in CyberForge: the lab replays synthetic telemetry, so no setup is needed.

## Telemetry

- **auth.log** (`linux/auth`): sudo records who ran which command as which user, from which terminal.

The simulated events live in [`telemetry/scenario.jsonl`](telemetry/scenario.jsonl).

## Attack simulation

The simulation replays three routine sudo commands, then a sudoers edit, then two more routine commands. Only the edit should stand out.

1. **Routine administration** - Package updates and a service restart, all through sudo. Nothing here is unusual.
2. **The sudoers edit** - The same account runs visudo. This is the event the rule exists to catch.

## Expected detection

The lab's own Sigma rule matches sudo running a sudoers editor or opening /etc/sudoers, and stays quiet for ordinary commands.

- `sudoers-edit-via-sudo`

## Investigation questions

1. Which log line is the sudoers edit, and what makes it different from the lines around it?
   <details><summary>Hint and answer</summary>

   *Hint:* Read the COMMAND= part of each sudo line.

   *Answer:* The line whose COMMAND is /usr/sbin/visudo. The others run package and service tools.

   </details>
2. The rule also has a negative test for `apt update`. What does that test protect?
   <details><summary>Hint and answer</summary>

   *Hint:* Think about what would happen if the rule matched every sudo line.

   *Answer:* It proves the rule does not turn into an alert on all administration, which would be ignored within a day.

   </details>

## Mitigation
- Restrict who may edit sudoers and log every change to a separate, append-only destination.
- Manage sudoers through configuration management so a manual edit is by definition an exception.
- Alert on sudoers changes at the file level as well as at the command level.

## Cleanup
- Nothing to clean up: the simulation only adds synthetic events to your local instance.

## References

- [MITRE ATT&CK T1548.003 Sudo and Sudo Caching](https://attack.mitre.org/techniques/T1548/003/)

## Safety

Scope: `simulation-only` · Network: `none`. This lab only ever targets isolated CyberForge lab systems or synthetic data. See the [security model](../../docs/security-model.md).
