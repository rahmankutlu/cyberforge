import type { PlaygroundExplain, SigmaExplanation } from "@cyberforge/types";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { conditionSteps, matchedRows, OUTCOME_LABEL } from "@/lib/trace";

import { TraceView } from "./trace-view";

const item = (
  field: string,
  operator: string,
  values: [string, boolean][],
  actual: string | null,
  matched: boolean,
) => ({
  kind: "item" as const,
  field,
  modifiers: [],
  operator,
  linking: "or" as const,
  matched,
  actual,
  values: values.map(([text, m]) => ({ pattern: `*${text}*`, text, matched: m })),
});

const explanation: SigmaExplanation = {
  matched: true,
  outcome: "matched",
  summary: "Matched: selection_image, selection_flag matched and no exclusion applied.",
  logsource: {
    rule: { category: "process_creation", product: "windows" },
    event: { category: "process_creation", product: "windows" },
    compatible: true,
  },
  selections: [
    {
      kind: "selection",
      name: "selection_image",
      matched: true,
      linking: "and",
      children: [
        item(
          "Image",
          "ends with",
          [["\\powershell.exe", true]],
          "C:\\Windows\\powershell.exe",
          true,
        ),
      ],
    },
    {
      kind: "selection",
      name: "selection_flag",
      matched: true,
      linking: "and",
      children: [
        item(
          "CommandLine",
          "contains",
          [
            [" -enc ", true],
            [" -ec ", false],
          ],
          "powershell.exe -enc AAAA",
          true,
        ),
      ],
    },
    {
      kind: "selection",
      name: "filter_management",
      matched: false,
      linking: "and",
      children: [item("ParentImage", "ends with", [["\\CcmExec.exe", false]], "C:\\x.exe", false)],
    },
  ],
  condition: {
    op: "and",
    label: "selection_image and selection_flag and not filter_management",
    matched: true,
    children: [
      { op: "selection", label: "selection_image", matched: true, children: [] },
      { op: "selection", label: "selection_flag", matched: true, children: [] },
      {
        op: "not",
        label: "not filter_management",
        matched: true,
        children: [{ op: "selection", label: "filter_management", matched: false, children: [] }],
      },
    ],
  },
  condition_text: "selection_image and selection_flag and not filter_management",
  hints: ["Possible false positive: Endpoint management agents"],
};

const wrap = (e: SigmaExplanation): PlaygroundExplain => ({
  format: "sigma",
  kind: "event",
  matched: e.matched,
  explanation: e,
  item: {
    index: 0,
    kind: "event",
    title: "t",
    offset_seconds: 0,
    timestamp: null,
    category: null,
    source: null,
    host: null,
    user: null,
    raw: "",
    fields: {},
    note: null,
    size: null,
  },
});

describe("trace helpers", () => {
  it("lists one row per matched item and skips exclusion filters", () => {
    const rows = matchedRows(explanation.selections);
    expect(rows.map((r) => [r.selection, r.field, r.pattern])).toEqual([
      ["selection_image", "Image", "\\powershell.exe"],
      ["selection_flag", "CommandLine", " -enc "],
    ]);
  });

  it("flattens the condition tree with depth", () => {
    const steps = conditionSteps(explanation.condition);
    expect(steps.map((s) => [s.depth, s.label])).toEqual([
      [0, "selection_image and selection_flag and not filter_management"],
      [1, "selection_image"],
      [1, "selection_flag"],
      [1, "not filter_management"],
      [2, "filter_management"],
    ]);
  });

  it("has a label for every outcome", () => {
    expect(Object.keys(OUTCOME_LABEL).sort()).toEqual([
      "logsource_mismatch",
      "matched",
      "not_matched",
    ]);
  });
});

describe("TraceView (Sigma)", () => {
  it("states the outcome, the selection, field, value and the condition path", () => {
    render(<TraceView data={wrap(explanation)} />);
    expect(screen.getByTestId("match-outcome")).toHaveAttribute("data-outcome", "MATCHED");
    const why = within(screen.getByTestId("why-matched"));
    expect(why.getByText("Image")).toBeInTheDocument();
    expect(why.getByText("selection_flag")).toBeInTheDocument();
    expect(screen.getByTestId("selection-selection_image")).toHaveAttribute("data-matched", "true");
    expect(screen.getByTestId("selection-filter_management")).toHaveAttribute(
      "data-matched",
      "false",
    );
    expect(screen.getByText("exclusion")).toBeInTheDocument();
    const path = within(screen.getByTestId("condition-path"));
    expect(path.getByText("AND")).toBeInTheDocument();
    expect(path.getAllByRole("img", { name: "matched" }).length).toBeGreaterThan(2);
    expect(screen.getByTestId("trace-result")).toHaveTextContent("MATCHED");
    expect(screen.getByTestId("fp-hints")).toHaveTextContent("Endpoint management agents");
  });

  it("does not rely on colour alone: every value chip is announced as matched or not", () => {
    render(<TraceView data={wrap(explanation)} />);
    const chips = within(screen.getByTestId("selection-selection_flag")).getAllByRole("listitem");
    const text = chips.map((c) => c.textContent);
    expect(text.some((t) => t?.startsWith("matched:"))).toBe(true);
    expect(text.some((t) => t?.startsWith("did not match:"))).toBe(true);
  });

  it("explains a miss without a why-matched section", () => {
    const miss: SigmaExplanation = {
      ...explanation,
      matched: false,
      outcome: "not_matched",
      summary: "Did not match: `selection_flag` did not match",
      hints: [],
    };
    render(<TraceView data={wrap(miss)} />);
    expect(screen.getByTestId("match-outcome")).toHaveAttribute("data-outcome", "NO MATCH");
    expect(screen.queryByTestId("why-matched")).not.toBeInTheDocument();
    expect(screen.queryByTestId("fp-hints")).not.toBeInTheDocument();
  });

  it("warns about a logsource mismatch", () => {
    const wrong: SigmaExplanation = {
      ...explanation,
      matched: false,
      outcome: "logsource_mismatch",
    };
    render(<TraceView data={wrap(wrong)} />);
    expect(screen.getByTestId("match-outcome")).toHaveAttribute("data-outcome", "WRONG LOGSOURCE");
  });
});
