import type { AlertSummary, Lifecycle, SecurityEvent } from "@cyberforge/types";

export const alertSummary: AlertSummary = {
  id: 7,
  title: "PowerShell Launched With Encoded Command",
  severity: "high",
  status: "new",
  source: "sysmon",
  timestamp: "2026-09-28T02:14:08Z",
  host: "WKS-014",
  user: "CORP\\jdoe",
  rule: {
    id: 1,
    slug: "win-encoded-powershell-command",
    title: "PowerShell Launched With Encoded Command",
    level: "high",
    format: "sigma",
  },
  technique: { id: "T1059.001", name: "PowerShell", framework: "attack" },
  tactic: "Execution",
  confidence: 80,
  assignee: null,
  investigation_id: null,
  lab_run_id: 3,
  synthetic: true,
};

const raw = String.raw`{"EventID":1,"Computer":"WKS-014","Image":"C:\\Windows\\System32\\powershell.exe","CommandLine":"powershell.exe -nop -enc SQBFAFgA"}`;

export const securityEvent: SecurityEvent = {
  id: 11,
  timestamp: "2026-09-28T02:14:08Z",
  source: "sysmon",
  category: "process_creation",
  logsource: { category: "process_creation", product: "windows" },
  host: "WKS-014",
  user: "CORP\\jdoe",
  action: "process_create",
  outcome: "success",
  src_ip: null,
  dst_ip: null,
  dst_port: null,
  process: "C:\\Windows\\System32\\powershell.exe",
  parent_process: "C:\\Windows\\System32\\cmd.exe",
  command_line: "powershell.exe -nop -enc SQBFAFgA",
  message: "powershell.exe launched by cmd.exe as CORP\\jdoe",
  raw,
  fields: {
    Image: "C:\\Windows\\System32\\powershell.exe",
    CommandLine: "powershell.exe -nop -enc SQBFAFgA",
    Computer: "WKS-014",
  },
  note: "PowerShell runs hidden with an encoded command.",
  synthetic: true,
  dataset: null,
  lab_run_id: 3,
};

export const lifecycle: Lifecycle = {
  alert: alertSummary,
  simulation: {
    lab: {
      id: 10,
      slug: "suspicious-powershell-detection-simulation",
      title: "Suspicious PowerShell Detection Simulation",
      number: 10,
      domain: "windows-sim",
    },
    run_id: 3,
    description: "The simulation replays seven telemetry events.",
    narrative: [
      "Document opened: a macro-enabled file opens in Word.",
      "Shell spawned: Word starts cmd.exe.",
    ],
    synthetic: true,
  },
  raw_events: [
    { id: 11, timestamp: securityEvent.timestamp, source: "sysmon", raw, note: securityEvent.note },
  ],
  parsed_events: [securityEvent],
  rule: {
    id: 1,
    slug: "win-encoded-powershell-command",
    title: "PowerShell Launched With Encoded Command",
    level: "high",
    format: "sigma",
    description: "Detects PowerShell started with an encoded command argument.",
    content:
      "title: PowerShell Launched With Encoded Command\ndetection:\n  selection_flag:\n    CommandLine|contains:\n      - ' -enc '\n  condition: selection_flag\n",
    logsource: { category: "process_creation", product: "windows" },
    false_positives: ["Endpoint management agents"],
    is_correlation: false,
  },
  match: {
    trace: [
      {
        field: "Image",
        value: "C:\\Windows\\System32\\powershell.exe",
        pattern: "*\\powershell.exe",
      },
      { field: "CommandLine", value: "powershell.exe -nop -enc SQBFAFgA", pattern: "* -enc *" },
    ],
    correlation: null,
    group: null,
    explanation: "The rule's selection matched on CommandLine, Image.",
    matched_event_ids: [11],
  },
  mitre: {
    technique: { id: "T1059.001", name: "PowerShell", framework: "attack" },
    description: "Adversaries may abuse PowerShell commands and scripts for execution.",
    url: "https://attack.mitre.org/techniques/T1059/001/",
    tactics: [
      {
        id: "TA0002",
        framework: "attack",
        shortname: "execution",
        name: "Execution",
        description: "",
        url: "",
        position: 3,
      },
    ],
    other_techniques: [{ id: "T1027.010", name: "Command Obfuscation", framework: "attack" }],
    mitigations: [
      {
        id: "M1049",
        name: "Antivirus/Antimalware",
        description: "Anti-virus can automatically detect and quarantine malicious scripts.",
      },
    ],
  },
  investigation: null,
  mitigation: {
    source: "lab",
    actions: [
      "Block or restrict Office macros from the internet.",
      "Enable PowerShell script block logging.",
    ],
    analyst_steps: ["Prioritise now: confirm scope within the hour.", "Read the raw event first."],
  },
};
