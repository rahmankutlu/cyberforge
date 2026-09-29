import type { Story, StoryStep } from "@cyberforge/types";

/**
 * Story progress is plain data kept in the learner's browser (one localStorage entry per story).
 * Nothing about a story run is stored on the server: there is no account and no upload.
 */
export interface StoryProgress {
  version: 1;
  /** How many steps have been revealed (at least 1). */
  revealed: number;
  /** Evidence ids the analyst marked as findings. */
  found: string[];
  /** Selected option ids per question. */
  answers: Record<string, string[]>;
  /** Questions the analyst has submitted (their answer is then marked). */
  checked: string[];
  /** Chosen option id per decision. */
  decisions: Record<string, string>;
  /** Containment actions selected (the plan). */
  containment: string[];
  /** The containment plan has been submitted. */
  submitted: boolean;
  /** The post-incident explanation was opened without submitting a plan. */
  skipped: boolean;
}

export const emptyProgress = (): StoryProgress => ({
  version: 1,
  revealed: 1,
  found: [],
  answers: {},
  checked: [],
  decisions: {},
  containment: [],
  submitted: false,
  skipped: false,
});

export type StoryAction =
  | { type: "reveal-next"; total: number }
  | { type: "reveal-all"; total: number }
  | { type: "toggle-finding"; id: string }
  | { type: "answer"; question: string; option: string; multiple: boolean }
  | { type: "check"; question: string }
  | { type: "decide"; decision: string; option: string }
  | { type: "toggle-containment"; id: string }
  | { type: "submit-containment" }
  | { type: "skip-to-review" }
  | { type: "reset" };

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

export function reduceStory(state: StoryProgress, action: StoryAction): StoryProgress {
  switch (action.type) {
    case "reveal-next":
      return { ...state, revealed: Math.min(action.total, state.revealed + 1) };
    case "reveal-all":
      return { ...state, revealed: action.total };
    case "toggle-finding":
      return { ...state, found: toggle(state.found, action.id) };
    case "answer": {
      if (state.checked.includes(action.question)) return state; // locked once submitted
      const current = state.answers[action.question] ?? [];
      const next = action.multiple ? toggle(current, action.option) : [action.option];
      return { ...state, answers: { ...state.answers, [action.question]: next } };
    }
    case "check":
      if ((state.answers[action.question] ?? []).length === 0) return state;
      return state.checked.includes(action.question)
        ? state
        : { ...state, checked: [...state.checked, action.question] };
    case "decide":
      return state.decisions[action.decision]
        ? state // a decision is final: analysts live with their choices
        : { ...state, decisions: { ...state.decisions, [action.decision]: action.option } };
    case "toggle-containment":
      return state.submitted
        ? state
        : { ...state, containment: toggle(state.containment, action.id) };
    case "submit-containment":
      return state.containment.length === 0 ? state : { ...state, submitted: true };
    case "skip-to-review":
      return { ...state, skipped: true };
    case "reset":
      return emptyProgress();
  }
}

/** Defensive parse of whatever is in storage: a corrupt or older entry falls back to a fresh start. */
export function parseProgress(raw: string | null, story?: Story): StoryProgress {
  if (!raw) return emptyProgress();
  try {
    const data = JSON.parse(raw) as Partial<StoryProgress>;
    if (data.version !== 1 || typeof data.revealed !== "number") return emptyProgress();
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    const record = <T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> =>
      v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v as object).filter(([, x]) => ok(x)))
        : {};
    const total = story?.steps.length ?? Number.MAX_SAFE_INTEGER;
    return {
      version: 1,
      revealed: Math.max(1, Math.min(total, Math.floor(data.revealed))),
      found: strings(data.found),
      answers: record(data.answers, (x): x is string[] => Array.isArray(x)),
      checked: strings(data.checked),
      decisions: record(data.decisions, (x): x is string => typeof x === "string"),
      containment: strings(data.containment),
      submitted: data.submitted === true,
      skipped: data.skipped === true,
    };
  } catch {
    return emptyProgress();
  }
}

// ── derived facts ──────────────────────────────────────────────────────────────────────────

export const revealedSteps = (story: Story, progress: StoryProgress): StoryStep[] =>
  story.steps.slice(0, progress.revealed);

export const allRevealed = (story: Story, progress: StoryProgress): boolean =>
  progress.revealed >= story.steps.length;

export interface Pipeline {
  telemetry: number;
  detections: number;
  alerts: number;
  techniques: number;
  decisions: number;
  containment: number;
  lessons: number;
}

/** Counts for the Telemetry → Detections → Alerts → MITRE → Decisions → Containment → Lessons strip. */
export function pipelineCounts(story: Story, progress: StoryProgress): Pipeline {
  const steps = revealedSteps(story, progress);
  return {
    telemetry: steps.reduce((n, s) => n + s.events.length, 0),
    detections: steps.reduce((n, s) => n + s.detections.length, 0),
    alerts: steps.filter((s) => s.alert).length,
    techniques: new Set(steps.flatMap((s) => s.techniques.map((t) => t.id))).size,
    decisions: Object.keys(progress.decisions).length,
    containment: progress.submitted ? progress.containment.length : 0,
    lessons: progress.submitted || progress.skipped ? story.postmortem.lessons.length : 0,
  };
}

export interface Review {
  questionsAnswered: number;
  questionsCorrect: number;
  questionsTotal: number;
  keyEvidenceFound: number;
  keyEvidenceTotal: number;
  decisionsBest: number;
  decisionsMade: number;
  decisionsTotal: number;
  recommendedChosen: number;
  recommendedTotal: number;
  harmfulChosen: number;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

export function isCorrect(question: StoryStep["questions"][number], chosen: string[]): boolean {
  const correct = question.options.filter((o) => o.correct).map((o) => o.id);
  return sameSet(chosen, correct);
}

/** A factual summary of the run. Deliberately not a score: it counts, it does not rank. */
export function review(story: Story, progress: StoryProgress): Review {
  const questions = story.steps.flatMap((s) => s.questions);
  const decisions = story.steps.flatMap((s) => (s.decision ? [s.decision] : []));
  const key = story.steps.flatMap((s) => s.evidence).filter((e) => e.significance === "key");
  const answered = questions.filter((q) => progress.checked.includes(q.id));
  return {
    questionsAnswered: answered.length,
    questionsCorrect: answered.filter((q) => isCorrect(q, progress.answers[q.id] ?? [])).length,
    questionsTotal: questions.length,
    keyEvidenceFound: key.filter((e) => progress.found.includes(e.id)).length,
    keyEvidenceTotal: key.length,
    decisionsBest: decisions.filter(
      (d) => d.options.find((o) => o.id === progress.decisions[d.id])?.quality === "best",
    ).length,
    decisionsMade: decisions.filter((d) => progress.decisions[d.id]).length,
    decisionsTotal: decisions.length,
    recommendedChosen: story.containment.filter(
      (c) => c.quality === "recommended" && progress.containment.includes(c.id),
    ).length,
    recommendedTotal: story.containment.filter((c) => c.quality === "recommended").length,
    harmfulChosen: story.containment.filter(
      (c) => c.quality === "harmful" && progress.containment.includes(c.id),
    ).length,
  };
}

export const storyStorageKey = (slug: string) => `cyberforge:story:${slug}`;

/** Fraction of the story worked through, for progress bars on the index page. */
export function completion(story: { step_count: number }, progress: StoryProgress): number {
  const stepPart = progress.revealed / story.step_count;
  return Math.round((progress.submitted ? 1 : stepPart * 0.85) * 100);
}
