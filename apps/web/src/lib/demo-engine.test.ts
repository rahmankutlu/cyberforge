import type { DemoScript } from "@cyberforge/types";
import { describe, expect, it } from "vitest";

import { clockAt, mmss, processLines, stateAt, tacticHeat } from "./demo-engine";
import { clock, parseStreamEvent, pushEvent, STREAM_WINDOW } from "./live-stream";

const ev = (id: string, t: number, detections: string[] = []) =>
  ({
    id,
    t,
    timestamp: "",
    host: "H",
    user: null,
    source: "s",
    category: "c",
    message: id,
    command_line: null,
    raw: "",
    fields: {},
    note: null,
    detections,
    severity: detections.length ? "high" : "informational",
  }) as DemoScript["events"][number];

const script: DemoScript = {
  slug: "s",
  title: "S",
  summary: "s",
  duration_seconds: 60,
  start: "2026-03-10T09:14:00+00:00",
  host: "H",
  user: "u",
  events: [ev("a", 2), ev("b", 10, ["r1"]), ev("c", 20, ["r2"]), ev("d", 30)],
  alerts: [
    {
      id: "ALT-1",
      t: 11,
      rule: "r1",
      title: "One",
      severity: "high",
      event_id: "b",
      host: "H",
      technique: "T1059.001",
    },
    {
      id: "ALT-2",
      t: 21,
      rule: "r2",
      title: "Two",
      severity: "critical",
      event_id: "c",
      host: "H",
      technique: "T1003.001",
    },
  ],
  techniques: [
    {
      id: "T1059.001",
      name: "PowerShell",
      tactics: [{ id: "TA0002", name: "Execution" }],
      t: 11,
      rule: "r1",
    },
    {
      id: "T1003.001",
      name: "LSASS Memory",
      tactics: [{ id: "TA0006", name: "Credential Access" }],
      t: 21,
      rule: "r2",
    },
  ],
  tactics: [
    { id: "TA0002", name: "Execution" },
    { id: "TA0006", name: "Credential Access" },
    { id: "TA0040", name: "Impact" },
  ],
  process_tree: {
    nodes: [
      { id: "h:explorer", label: "explorer.exe", host: "H", t: 5, flagged: false, in_chain: true },
      { id: "h:cmd", label: "cmd.exe", host: "H", t: 10, flagged: true, in_chain: true },
      { id: "h:lsass", label: "lsass.exe", host: "H", t: 20, flagged: true, in_chain: true },
      { id: "h:chrome", label: "chrome.exe", host: "H", t: 3, flagged: false, in_chain: false },
    ],
    edges: [
      { source: "h:explorer", target: "h:cmd", t: 10 },
      { source: "h:cmd", target: "h:lsass", t: 20, kind: "access" },
    ],
  },
  severity_timeline: [
    { t: 0, severity: "informational" },
    { t: 11, severity: "high" },
    { t: 21, severity: "critical" },
  ],
  notes: [{ t: 12, analyst: "SOC", body: "note" }],
  containment: [
    { t: 0, state: "monitoring", label: "Monitoring", detail: "d" },
    { t: 40, state: "contained", label: "Contained", detail: "d" },
  ],
  incident_summary: {
    t: 54,
    headline: "h",
    paragraphs: ["p"],
    stats: {
      events: 4,
      suspicious_events: 2,
      alerts: 2,
      rules: 2,
      techniques: 2,
      tactics: 2,
      peak_severity: "critical",
      seconds_to_first_alert: 1,
      seconds_to_containment: 30,
    },
  },
};

describe("stateAt", () => {
  it("shows nothing before anything has happened", () => {
    const s = stateAt(script, 0);
    expect(s.events).toEqual([]);
    expect(s.alerts).toEqual([]);
    expect(s.severity).toBe("informational");
    expect(s.containment.state).toBe("monitoring");
    expect(s.stage).toBe("idle");
    expect(s.finished).toBe(false);
  });

  it("reveals everything up to and including t, and nothing after", () => {
    const s = stateAt(script, 11);
    expect(s.events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(s.matchedEvents).toBe(1);
    expect(s.alerts.map((a) => a.id)).toEqual(["ALT-1"]);
    expect(s.techniques.map((t) => t.id)).toEqual(["T1059.001"]);
    expect(s.severity).toBe("high");
    expect(s.notes).toEqual([]);
  });

  it("escalates severity and keeps its history in order", () => {
    const s = stateAt(script, 25);
    expect(s.severity).toBe("critical");
    expect(s.severityHistory.map((h) => h.severity)).toEqual(["informational", "high", "critical"]);
  });

  it("moves containment and reveals the summary at their times", () => {
    expect(stateAt(script, 39).containment.state).toBe("monitoring");
    expect(stateAt(script, 40).containment.state).toBe("contained");
    expect(stateAt(script, 53).summaryVisible).toBe(false);
    expect(stateAt(script, 54).summaryVisible).toBe(true);
    expect(stateAt(script, 54).stage).toBe("summary");
  });

  it("clamps time to the demo's length and reports when it is over", () => {
    expect(stateAt(script, -5).t).toBe(0);
    const end = stateAt(script, 999);
    expect(end.t).toBe(60);
    expect(end.finished).toBe(true);
  });

  it("only shows the process chain that has appeared, without unrelated processes", () => {
    const s = stateAt(script, 12);
    expect(s.processNodes.map((n) => n.label)).toEqual(["explorer.exe", "cmd.exe"]);
    expect(s.processEdges).toHaveLength(1);
  });

  it("is a pure function: the same time gives the same state", () => {
    expect(stateAt(script, 33)).toEqual(stateAt(script, 33));
  });
});

describe("demo helpers", () => {
  it("formats the scenario clock and elapsed time", () => {
    expect(clockAt(script, 52)).toBe("09:14:52");
    expect(clockAt(script, 75)).toBe("09:15:15");
    expect(mmss(75.9)).toBe("01:15");
  });

  it("builds heatmap counts per tactic", () => {
    const heat = tacticHeat(script, stateAt(script, 25).techniques);
    expect(heat.map((h) => [h.id, h.count])).toEqual([
      ["TA0002", 1],
      ["TA0006", 1],
      ["TA0040", 0],
    ]);
  });

  it("indents the process chain and marks memory access", () => {
    const s = stateAt(script, 25);
    const lines = processLines(s.processNodes, s.processEdges);
    expect(lines.map((l) => [l.node.label, l.depth, Boolean(l.accessed)])).toEqual([
      ["explorer.exe", 0, false],
      ["cmd.exe", 1, false],
      ["lsass.exe", 2, true],
    ]);
  });
});

describe("live stream helpers", () => {
  const base = {
    seq: 1,
    timestamp: "2026-03-10T09:14:52.123+00:00",
    source: "s",
    host: "H",
    event_type: "dns_query",
    message: "m",
    rule: null,
    rule_slug: null,
    severity: "informational",
    dataset: "d",
  };

  it("keeps only the newest events, newest first", () => {
    let list = [] as ReturnType<typeof pushEvent>;
    for (let i = 0; i < STREAM_WINDOW + 5; i++) list = pushEvent(list, { ...base, seq: i });
    expect(list).toHaveLength(STREAM_WINDOW);
    expect(list[0]!.seq).toBe(STREAM_WINDOW + 4);
  });

  it("parses a valid message and drops malformed ones", () => {
    expect(parseStreamEvent(JSON.stringify(base))?.host).toBe("H");
    expect(parseStreamEvent("{oops")).toBeNull();
    expect(parseStreamEvent(JSON.stringify({ seq: "x" }))).toBeNull();
    expect(parseStreamEvent(JSON.stringify({ ...base, message: 5 }))?.message).toBe("");
  });

  it("shows the time of day in UTC", () => {
    expect(clock(base.timestamp)).toBe("09:14:52");
  });
});
