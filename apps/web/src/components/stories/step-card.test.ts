import type { StoryStep } from "@cyberforge/types";
import { describe, expect, it } from "vitest";

import { emptyProgress } from "@/lib/story-state";

import { stepProgressKey } from "./step-card";

const step = {
  evidence: [{ id: "e1" }, { id: "e2" }],
  questions: [{ id: "q1" }],
  decision: { id: "d1" },
} as unknown as StoryStep;

describe("stepProgressKey", () => {
  it("is stable while nothing in this step changes", () => {
    const a = emptyProgress();
    const b = { ...emptyProgress(), revealed: 4, found: ["elsewhere"], answers: { other: ["x"] } };
    expect(stepProgressKey(step, a)).toBe(stepProgressKey(step, b));
  });

  it("changes when evidence, an answer or the decision of this step changes", () => {
    const base = stepProgressKey(step, emptyProgress());
    expect(stepProgressKey(step, { ...emptyProgress(), found: ["e2"] })).not.toBe(base);
    expect(stepProgressKey(step, { ...emptyProgress(), answers: { q1: ["a"] } })).not.toBe(base);
    expect(
      stepProgressKey(step, { ...emptyProgress(), answers: { q1: ["a"] }, checked: ["q1"] }),
    ).not.toBe(stepProgressKey(step, { ...emptyProgress(), answers: { q1: ["a"] } }));
    expect(stepProgressKey(step, { ...emptyProgress(), decisions: { d1: "best" } })).not.toBe(base);
  });
});
