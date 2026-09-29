/** Starter rule for /detections/new. Kept out of the client component so server pages can import it. */
export const NEW_RULE_TEMPLATE = `title: Suspicious Use Of whoami From Command Shell
id: 00000000-0000-0000-0000-000000000000
status: experimental
description: >
  Detects whoami launched by a command shell. Replace this with what your rule detects and why it matters.
references:
  - https://attack.mitre.org/techniques/T1033/
author: You
date: 2026-09-01
tags:
  - attack.t1082
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\\whoami.exe'
    ParentImage|endswith: '\\cmd.exe'
  condition: selection
falsepositives:
  - Administrators checking their own context
level: low
`;
