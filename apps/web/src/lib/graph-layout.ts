import type { GraphNodeType, StoryGraphEdge, StoryGraphNode, StoryStep } from "@cyberforge/types";

/** Left-to-right lanes: who and where, what ran, what the SOC saw, what it maps to. */
export const LANES: GraphNodeType[][] = [
  ["ip", "domain", "user"],
  ["host"],
  ["process"],
  ["detection"],
  ["alert"],
  ["technique"],
];

export const LANE_LABEL = ["Actors", "Hosts", "Activity", "Detections", "Alerts", "ATT&CK"];
export const COLUMN_WIDTH = 184;
export const ROW_HEIGHT = 52;

export interface PlacedNode extends StoryGraphNode {
  x: number;
  y: number;
  lane: number;
  /** Index of the step that introduced the node. */
  step: number;
}

const laneOf = (type: GraphNodeType) => LANES.findIndex((lane) => lane.includes(type));

/** Nodes and edges from the steps revealed so far, placed into lanes in order of appearance. */
export function buildGraph(steps: readonly StoryStep[]): {
  nodes: PlacedNode[];
  edges: (StoryGraphEdge & { step: number; id: string })[];
} {
  const rows = LANES.map(() => 0);
  const seen = new Set<string>();
  const nodes: PlacedNode[] = [];
  const edges: (StoryGraphEdge & { step: number; id: string })[] = [];
  steps.forEach((step, si) => {
    for (const node of step.graph.nodes) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      const lane = Math.max(0, laneOf(node.type));
      nodes.push({
        ...node,
        lane,
        step: si,
        x: lane * COLUMN_WIDTH,
        y: (rows[lane] ?? 0) * ROW_HEIGHT,
      });
      rows[lane] = (rows[lane] ?? 0) + 1;
    }
    step.graph.edges.forEach((edge, ei) => {
      if (seen.has(edge.source) && seen.has(edge.target)) {
        edges.push({ ...edge, step: si, id: `${si}-${ei}-${edge.source}-${edge.target}` });
      }
    });
  });
  return { nodes, edges };
}

/** "source relation target" lines: the text alternative to the drawn graph. */
export function describeEdges(
  nodes: readonly StoryGraphNode[],
  edges: readonly StoryGraphEdge[],
): string[] {
  const label = new Map(nodes.map((n) => [n.id, n.label] as const));
  return edges.map(
    (e) => `${label.get(e.source) ?? e.source} ${e.relation} ${label.get(e.target) ?? e.target}`,
  );
}

/** Canvas height that fits the tallest lane without leaving a large empty area. */
export function graphHeight(nodes: readonly PlacedNode[]): number {
  const rows = LANES.map((_, lane) => nodes.filter((n) => n.lane === lane).length);
  const tallest = Math.max(1, ...rows);
  return Math.min(560, Math.max(280, tallest * ROW_HEIGHT + 120));
}
