import type { TraceCondition, TraceItem, TraceSelection } from "@cyberforge/types";

export interface MatchRow {
  selection: string;
  field: string;
  operator: string;
  /** The rule value that matched, as a person would say it. */
  pattern: string;
  /** The event's value for the field. */
  actual: string;
}

const isItem = (node: TraceItem | TraceSelection): node is TraceItem => node.kind === "item";

/** Format an event value for display: strings as-is, everything else as JSON. */
export function showValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function collect(node: TraceItem | TraceSelection, selection: string, rows: MatchRow[]): void {
  if (!node.matched) return;
  if (isItem(node)) {
    const hit = node.values.find((v) => v.matched);
    rows.push({
      selection,
      field: node.field ?? "(any field)",
      operator: node.operator,
      pattern: hit?.text ?? "",
      actual: showValue(node.actual),
    });
    return;
  }
  for (const child of node.children) collect(child, selection, rows);
}

/**
 * The rows that explain a match: for every selection that matched (exclusion filters are shown
 * separately), the field, the operator, the rule value that hit and the event's actual value.
 */
export function matchedRows(selections: readonly TraceSelection[]): MatchRow[] {
  const rows: MatchRow[] = [];
  for (const selection of selections) {
    if (!selection.matched || selection.name.startsWith("filter")) continue;
    for (const child of selection.children) collect(child, selection.name, rows);
  }
  return rows;
}

export interface ConditionStep {
  depth: number;
  op: TraceCondition["op"];
  label: string;
  matched: boolean;
}

/** Depth-first list of the condition tree, ready to render as an indented outline. */
export function conditionSteps(tree: TraceCondition | null): ConditionStep[] {
  const steps: ConditionStep[] = [];
  const visit = (node: TraceCondition, depth: number) => {
    steps.push({ depth, op: node.op, label: node.label, matched: node.matched });
    if (node.op !== "selection") for (const child of node.children) visit(child, depth + 1);
  };
  if (tree) visit(tree, 0);
  return steps;
}

export const OUTCOME_LABEL = {
  matched: "MATCHED",
  not_matched: "NO MATCH",
  logsource_mismatch: "WRONG LOGSOURCE",
} as const;

/** Short text like `Image ends with "\powershell.exe"` for a trace item. */
export function describeItem(item: TraceItem): string {
  const values = item.values.map((v) => `"${v.text}"`);
  const joiner = item.linking === "and" ? " and " : " or ";
  const shown = values.length > 3 ? `${values.slice(0, 3).join(joiner)} …` : values.join(joiner);
  return `${item.field ?? "any field"} ${item.operator} ${shown}`;
}
