import type { Story, StoryStep } from "@cyberforge/types";
import { describe, expect, it } from "vitest";

import { buildGraph, describeEdges, graphHeight } from "./graph-layout";
import {
  completion,
  emptyProgress,
  isCorrect,
  parseProgress,
  pipelineCounts,
  reduceStory,
  review,
} from "./story-state";

const step = (n: number, over: Partial<StoryStep> = {}): StoryStep => ({
  id: `s${n}`,
  time: `08:${40 + n}`,
  timestamp: "2026-03-10T08:41:00+00:00",
  title: `Step ${n}`,
  narrative: "n",
  events: [
    { index: 0 } as StoryStep["events"][number],
    { index: 1 } as StoryStep["events"][number],
  ],
  evidence: [
    { id: `e${n}k`, title: "key", kind: "log", content: "x", significance: "key", finding: "why" },
    {
      id: `e${n}n`,
      title: "noise",
      kind: "log",
      content: "x",
      significance: "noise",
      finding: null,
    },
  ],
  detections: [
    {
      slug: "r",
      title: "R",
      level: "high",
      format: "sigma",
      is_correlation: false,
      techniques: [],
      events: [0],
      declared: true,
      why: null,
    },
  ],
  alert: { title: "a", severity: "high", rule: "r" },
  techniques: [{ id: "T1078", name: "Valid Accounts" }],
  questions: [
    {
      id: `q${n}`,
      prompt: "Which?",
      kind: "single",
      hint: null,
      options: [
        { id: "a", text: "A", correct: true, explanation: "yes" },
        { id: "b", text: "B", correct: false, explanation: "no" },
      ],
    },
  ],
  decision: {
    id: `d${n}`,
    prompt: "Choose",
    context: null,
    options: [
      { id: "best", text: "B", quality: "best", feedback: "f" },
      { id: "poor", text: "P", quality: "poor", feedback: "f" },
    ],
  },
  graph: {
    nodes: [
      { id: `ip${n}`, type: "ip", label: "203.0.113.5", ref: null },
      { id: "host", type: "host", label: "HOST", ref: null },
      { id: `det${n}`, type: "detection", label: "Rule", ref: "r" },
    ],
    edges: [
      { source: `ip${n}`, target: "host", relation: "connected to" },
      { source: `det${n}`, target: "host", relation: "associated with" },
    ],
  },
  ...over,
});

const story = {
  slug: "s",
  step_count: 3,
  steps: [step(1), step(2), step(3)],
  containment: [
    {
      id: "iso",
      action: "Isolate",
      category: "isolate",
      quality: "recommended",
      effect: "e",
      feedback: "f",
    },
    {
      id: "rot",
      action: "Rotate",
      category: "credentials",
      quality: "recommended",
      effect: "e",
      feedback: "f",
    },
    {
      id: "wipe",
      action: "Wipe",
      category: "eradicate",
      quality: "harmful",
      effect: "e",
      feedback: "f",
    },
  ],
  postmortem: { lessons: ["one", "two", "three"] },
} as unknown as Story;

describe("story progress reducer", () => {
  it("reveals one step at a time and never beyond the last", () => {
    let p = emptyProgress();
    p = reduceStory(p, { type: "reveal-next", total: 3 });
    expect(p.revealed).toBe(2);
    p = reduceStory(reduceStory(p, { type: "reveal-next", total: 3 }), {
      type: "reveal-next",
      total: 3,
    });
    expect(p.revealed).toBe(3);
    expect(reduceStory(p, { type: "reveal-all", total: 3 }).revealed).toBe(3);
  });

  it("toggles findings", () => {
    const on = reduceStory(emptyProgress(), { type: "toggle-finding", id: "e1k" });
    expect(on.found).toEqual(["e1k"]);
    expect(reduceStory(on, { type: "toggle-finding", id: "e1k" }).found).toEqual([]);
  });

  it("handles single and multiple answers and locks them once checked", () => {
    let p = reduceStory(emptyProgress(), {
      type: "answer",
      question: "q",
      option: "a",
      multiple: false,
    });
    p = reduceStory(p, { type: "answer", question: "q", option: "b", multiple: false });
    expect(p.answers.q).toEqual(["b"]);
    p = reduceStory(emptyProgress(), {
      type: "answer",
      question: "m",
      option: "a",
      multiple: true,
    });
    p = reduceStory(p, { type: "answer", question: "m", option: "b", multiple: true });
    expect(p.answers.m).toEqual(["a", "b"]);
    p = reduceStory(p, { type: "check", question: "m" });
    expect(
      reduceStory(p, { type: "answer", question: "m", option: "a", multiple: true }).answers.m,
    ).toEqual(["a", "b"]);
  });

  it("cannot check an unanswered question", () => {
    expect(reduceStory(emptyProgress(), { type: "check", question: "q" }).checked).toEqual([]);
  });

  it("makes decisions final", () => {
    let p = reduceStory(emptyProgress(), { type: "decide", decision: "d", option: "poor" });
    p = reduceStory(p, { type: "decide", decision: "d", option: "best" });
    expect(p.decisions.d).toBe("poor");
  });

  it("requires a non-empty containment plan and locks it after submitting", () => {
    let p = reduceStory(emptyProgress(), { type: "submit-containment" });
    expect(p.submitted).toBe(false);
    p = reduceStory(p, { type: "toggle-containment", id: "iso" });
    p = reduceStory(p, { type: "submit-containment" });
    expect(p.submitted).toBe(true);
    expect(reduceStory(p, { type: "toggle-containment", id: "rot" }).containment).toEqual(["iso"]);
  });

  it("resets", () => {
    const dirty = reduceStory(emptyProgress(), { type: "toggle-finding", id: "x" });
    expect(reduceStory(dirty, { type: "reset" })).toEqual(emptyProgress());
  });
});

describe("parseProgress", () => {
  it("falls back to a fresh run for missing, corrupt or old data", () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress("{nope")).toEqual(emptyProgress());
    expect(parseProgress(JSON.stringify({ version: 0, revealed: 3 }))).toEqual(emptyProgress());
  });

  it("keeps valid data and clamps revealed to the story length", () => {
    const raw = JSON.stringify({
      ...emptyProgress(),
      revealed: 99,
      found: ["a", 5, "b"],
      submitted: true,
    });
    const p = parseProgress(raw, story);
    expect(p.revealed).toBe(3);
    expect(p.found).toEqual(["a", "b"]);
    expect(p.submitted).toBe(true);
  });
});

describe("derived facts", () => {
  it("counts the pipeline from what has been revealed", () => {
    const p = { ...emptyProgress(), revealed: 2 };
    expect(pipelineCounts(story, p)).toMatchObject({
      telemetry: 4,
      detections: 2,
      alerts: 2,
      techniques: 1,
      decisions: 0,
      containment: 0,
      lessons: 0,
    });
    const done = {
      ...p,
      revealed: 3,
      decisions: { d1: "best" },
      containment: ["iso"],
      submitted: true,
    };
    expect(pipelineCounts(story, done)).toMatchObject({ decisions: 1, containment: 1, lessons: 3 });
  });

  it("checks question answers exactly", () => {
    const q = story.steps[0]!.questions[0]!;
    expect(isCorrect(q, ["a"])).toBe(true);
    expect(isCorrect(q, ["b"])).toBe(false);
    expect(isCorrect(q, ["a", "b"])).toBe(false);
  });

  it("summarises the run as counts, not a grade", () => {
    const p = {
      ...emptyProgress(),
      revealed: 3,
      found: ["e1k", "e2k"],
      answers: { q1: ["a"], q2: ["b"] },
      checked: ["q1", "q2"],
      decisions: { d1: "best", d2: "poor" },
      containment: ["iso", "wipe"],
      submitted: true,
    };
    expect(review(story, p)).toEqual({
      questionsAnswered: 2,
      questionsCorrect: 1,
      questionsTotal: 3,
      keyEvidenceFound: 2,
      keyEvidenceTotal: 3,
      decisionsBest: 1,
      decisionsMade: 2,
      decisionsTotal: 3,
      recommendedChosen: 1,
      recommendedTotal: 2,
      harmfulChosen: 1,
    });
  });

  it("reports completion for the index page", () => {
    expect(completion(story, emptyProgress())).toBe(28);
    expect(completion(story, { ...emptyProgress(), revealed: 3, submitted: true })).toBe(100);
  });
});

describe("investigation graph", () => {
  it("adds nodes lane by lane in order of appearance and de-duplicates shared nodes", () => {
    const { nodes, edges } = buildGraph(story.steps.slice(0, 2));
    expect(nodes.map((n) => n.id)).toEqual(["ip1", "host", "det1", "ip2", "det2"]);
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(byId.ip1!.lane).toBe(0);
    expect(byId.host!.lane).toBe(1);
    expect(byId.det1!.lane).toBe(3);
    expect(byId.ip2!.y).toBeGreaterThan(byId.ip1!.y);
    expect(byId.det2!.step).toBe(1);
    expect(edges).toHaveLength(4);
  });

  it("only draws edges whose ends are already known", () => {
    const orphan = step(1, {
      graph: { nodes: [], edges: [{ source: "x", target: "y", relation: "executed" }] },
    });
    expect(buildGraph([orphan]).edges).toEqual([]);
  });

  it("describes edges as text for screen readers", () => {
    const { nodes, edges } = buildGraph(story.steps.slice(0, 1));
    expect(describeEdges(nodes, edges)).toEqual([
      "203.0.113.5 connected to HOST",
      "Rule associated with HOST",
    ]);
  });

  it("sizes the canvas to the tallest lane within bounds", () => {
    const { nodes } = buildGraph(story.steps);
    const height = graphHeight(nodes);
    expect(height).toBeGreaterThanOrEqual(280);
    expect(height).toBeLessThanOrEqual(560);
  });
});
