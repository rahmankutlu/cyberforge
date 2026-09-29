import type { TechniqueCoverage } from "@cyberforge/types";

export type Metric = "rules" | "labs" | "alerts" | "investigations";

export const METRICS: { value: Metric; label: string; hint: string }[] = [
  { value: "rules", label: "Detection rules", hint: "Enabled rules mapped to the technique" },
  { value: "labs", label: "Labs", hint: "Labs that teach the technique" },
  { value: "alerts", label: "Alerts", hint: "Alerts raised on this instance" },
  {
    value: "investigations",
    label: "Investigations",
    hint: "Investigations that involve the technique",
  },
];

export function metricValue(t: TechniqueCoverage, metric: Metric): number {
  return t[metric];
}

/** 0 = empty, 1..4 = increasing intensity. Kept coarse so the map reads at a glance. */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

const ALPHA = { 0: 0, 1: 14, 2: 28, 3: 46, 4: 68 } as const;

export function heatBackground(count: number): string | undefined {
  const level = heatLevel(count);
  return level === 0
    ? undefined
    : `color-mix(in oklab, var(--primary) ${ALPHA[level]}%, transparent)`;
}

/** Group a flat technique list into parents with their sub-techniques. */
export function nestTechniques(
  list: TechniqueCoverage[],
): { parent: TechniqueCoverage; children: TechniqueCoverage[] }[] {
  const children = new Map<string, TechniqueCoverage[]>();
  for (const t of list) {
    if (t.parent_id) children.set(t.parent_id, [...(children.get(t.parent_id) ?? []), t]);
  }
  return list
    .filter((t) => !t.is_subtechnique)
    .map((parent) => ({ parent, children: children.get(parent.id) ?? [] }));
}

export function coverageSummary(techniques: TechniqueCoverage[]) {
  const top = techniques.filter((t) => !t.is_subtechnique);
  const covered = top.filter((t) => t.rules > 0);
  return {
    total: top.length,
    covered: covered.length,
    pct: top.length ? Math.round((covered.length / top.length) * 100) : 0,
    gaps: top.filter((t) => t.rules === 0),
  };
}
