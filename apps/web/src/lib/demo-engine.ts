import type {
  DemoAlert,
  DemoEvent,
  DemoProcessNode,
  DemoScript,
  DemoTechnique,
} from "@cyberforge/types";

/**
 * Demo playback is a pure function of time: `stateAt(script, t)` is everything a viewer sees after
 * `t` seconds. Nothing is random and nothing is fetched, so a paused demo, a screenshot and a
 * recording taken at the same second are identical.
 */
export interface DemoState {
  t: number;
  events: DemoEvent[];
  matchedEvents: number;
  alerts: DemoAlert[];
  techniques: DemoTechnique[];
  notes: DemoScript["notes"];
  processNodes: DemoProcessNode[];
  processEdges: DemoScript["process_tree"]["edges"];
  severity: string;
  severityHistory: { t: number; severity: string }[];
  containment: DemoScript["containment"][number];
  summaryVisible: boolean;
  finished: boolean;
  /** The most recent thing that happened, for the pipeline highlight. */
  stage: PipelineStage;
}

export type PipelineStage =
  "idle" | "ingest" | "detect" | "alert" | "mitre" | "investigate" | "contain" | "summary";

export const SEVERITY_LEVELS = ["informational", "low", "medium", "high", "critical"] as const;

const upTo = <T extends { t: number }>(items: readonly T[], t: number): T[] =>
  items.filter((i) => i.t <= t);

export function stateAt(script: DemoScript, time: number): DemoState {
  const t = Math.max(0, Math.min(script.duration_seconds, time));
  const events = upTo(script.events, t);
  const alerts = upTo(script.alerts, t);
  const techniques = upTo(script.techniques, t);
  const notes = upTo(script.notes, t);
  const history = upTo(script.severity_timeline, t);
  const containment = [...upTo(script.containment, t)].pop() ?? script.containment[0]!;
  const summaryVisible = t >= script.incident_summary.t;

  // The latest beat decides which pipeline stage is "live".
  const beats: [PipelineStage, number][] = [
    ["ingest", events[events.length - 1]?.t ?? -1],
    ["detect", Math.max(-1, ...events.filter((e) => e.detections.length).map((e) => e.t))],
    ["alert", alerts[alerts.length - 1]?.t ?? -1],
    ["mitre", techniques[techniques.length - 1]?.t ?? -1],
    ["investigate", notes[notes.length - 1]?.t ?? -1],
    ["contain", containment.t > 0 ? containment.t : -1],
    ["summary", summaryVisible ? script.incident_summary.t : -1],
  ];
  const latest = beats.reduce((best, cur) => (cur[1] >= best[1] ? cur : best), beats[0]!);
  const nodes = upTo(script.process_tree.nodes, t).filter((n) => n.in_chain);
  const ids = new Set(nodes.map((n) => n.id));

  return {
    t,
    events,
    matchedEvents: events.filter((e) => e.detections.length).length,
    alerts,
    techniques,
    notes,
    processNodes: nodes,
    processEdges: script.process_tree.edges.filter(
      (e) => e.t <= t && ids.has(e.source) && ids.has(e.target),
    ),
    severity: history[history.length - 1]?.severity ?? "informational",
    severityHistory: history,
    containment,
    summaryVisible,
    finished: t >= script.duration_seconds,
    stage: latest[1] < 0 ? "idle" : latest[0],
  };
}

/** Wall-clock time of the scenario at `t` seconds, as HH:MM:SS. */
export function clockAt(script: DemoScript, t: number): string {
  const at = new Date(new Date(script.start).getTime() + t * 1000);
  return at.toISOString().slice(11, 19);
}

/** `01:05` style elapsed time. */
export function mmss(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Per-tactic technique counts for the heatmap. A technique under two tactics counts under both. */
export function tacticHeat(
  script: DemoScript,
  techniques: readonly DemoTechnique[],
): { id: string; name: string; count: number; techniques: string[] }[] {
  return script.tactics.map((tactic) => {
    const hits = techniques.filter((tech) => tech.tactics.some((ta) => ta.id === tactic.id));
    return { ...tactic, count: hits.length, techniques: hits.map((h) => h.id) };
  });
}

/** Indented lines for the process chain: children under parents, in order of appearance. */
export function processLines(
  nodes: readonly DemoProcessNode[],
  edges: readonly { source: string; target: string; kind?: string }[],
): { node: DemoProcessNode; depth: number; accessed?: boolean }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const children = new Map<string, { id: string; access: boolean }[]>();
  const hasParent = new Set<string>();
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target)) continue;
    const list = children.get(e.source) ?? [];
    if (!list.some((c) => c.id === e.target))
      list.push({ id: e.target, access: e.kind === "access" });
    children.set(e.source, list);
    hasParent.add(e.target);
  }
  const out: { node: DemoProcessNode; depth: number; accessed?: boolean }[] = [];
  const seen = new Set<string>();
  const walk = (id: string, depth: number, accessed: boolean) => {
    const node = byId.get(id);
    if (!node || seen.has(id)) return;
    seen.add(id);
    out.push({ node, depth, accessed });
    for (const child of children.get(id) ?? []) walk(child.id, depth + 1, child.access);
  };
  for (const n of nodes) if (!hasParent.has(n.id)) walk(n.id, 0, false);
  return out;
}
