"use client";

import type {
  Severity,
  StoryDecision,
  StoryEvidence,
  StoryQuestion,
  StoryStep,
} from "@cyberforge/types";
import { Badge, Button, Card, cn } from "@cyberforge/ui";
import { CheckCircle2, Flag, Lightbulb, MinusCircle } from "lucide-react";
import Link from "next/link";
import { memo, useState } from "react";

import { SeverityBadge, TechniqueChip } from "@/components/badges";
import { CodeBlock } from "@/components/code-block";
import { formatOffset } from "@/lib/playground";
import { isCorrect, type StoryAction, type StoryProgress } from "@/lib/story-state";

const KIND_LABEL: Record<StoryEvidence["kind"], string> = {
  log: "Log",
  "process-tree": "Process tree",
  network: "Network",
  email: "Message",
  ticket: "Ticket",
  note: "Note",
  alert: "Alert",
};

function EvidenceItem({
  evidence,
  found,
  onToggle,
}: {
  evidence: StoryEvidence;
  found: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={cn(
        "rounded-lg border p-3",
        found ? "border-primary/40 bg-primary/5" : "border-border",
      )}
      data-testid="evidence"
      data-evidence={evidence.id}
      data-found={found}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-medium">
          {evidence.title}
          <Badge variant="outline">{KIND_LABEL[evidence.kind]}</Badge>
        </p>
        <Button
          variant={found ? "default" : "outline"}
          size="sm"
          onClick={onToggle}
          aria-pressed={found}
          data-testid="mark-finding"
        >
          <Flag /> {found ? "Marked as finding" : "Mark as finding"}
        </Button>
      </div>
      <CodeBlock code={evidence.content} maxHeight="14rem" className="mt-2" wrap />
      {found ? (
        <p className="mt-2 flex gap-2 text-xs text-foreground/90" data-testid="finding-text">
          <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
          <span>
            {evidence.finding ??
              (evidence.significance === "noise"
                ? "Marked, but this one is background: it does not change the picture."
                : "Marked. Keep it in mind as the picture develops.")}
          </span>
        </p>
      ) : null}
    </li>
  );
}

function Question({
  question,
  progress,
  dispatch,
}: {
  question: StoryQuestion;
  progress: StoryProgress;
  dispatch: (a: StoryAction) => void;
}) {
  const [hint, setHint] = useState(false);
  const chosen = progress.answers[question.id] ?? [];
  const checked = progress.checked.includes(question.id);
  const right = checked && isCorrect(question, chosen);
  const multiple = question.kind === "multiple";
  return (
    <fieldset
      className="rounded-lg border border-border p-3"
      data-testid="question"
      data-question={question.id}
    >
      <legend className="px-1 text-[13px] font-medium">Question</legend>
      <p className="text-[13px]">{question.prompt}</p>
      {multiple ? (
        <p className="mt-0.5 text-[11px] text-muted-foreground">Select all that apply.</p>
      ) : null}
      <ul className="mt-2 space-y-1.5">
        {question.options.map((o) => {
          const selected = chosen.includes(o.id);
          const shown = checked;
          return (
            <li key={o.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-md border p-2 text-[13px] transition-colors",
                  selected ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40",
                  shown && o.correct && "border-ok/50 bg-ok/8",
                  shown && selected && !o.correct && "border-sev-high/50 bg-sev-high/8",
                  checked && "cursor-default",
                )}
              >
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={question.id}
                  className="mt-1 accent-[var(--primary)]"
                  checked={selected}
                  disabled={checked}
                  onChange={() =>
                    dispatch({ type: "answer", question: question.id, option: o.id, multiple })
                  }
                  data-option={o.id}
                />
                <span className="min-w-0">
                  {o.text}
                  {shown ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        {o.correct ? "Correct. " : selected ? "Not quite. " : ""}
                      </span>
                      {o.explanation}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {!checked ? (
          <>
            <Button
              size="sm"
              onClick={() => dispatch({ type: "check", question: question.id })}
              disabled={chosen.length === 0}
              data-testid="check-answer"
            >
              Check answer
            </Button>
            {question.hint ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setHint((h) => !h)}
                aria-expanded={hint}
              >
                <Lightbulb /> {hint ? "Hide hint" : "Hint"}
              </Button>
            ) : null}
          </>
        ) : (
          <p
            className="flex items-center gap-1.5 text-xs font-medium"
            role="status"
            data-testid="answer-result"
            data-correct={right}
          >
            {right ? (
              <CheckCircle2 className="size-4 text-ok" aria-hidden />
            ) : (
              <MinusCircle className="size-4 text-sev-high" aria-hidden />
            )}
            {right ? "Your answer matches." : "Your answer differs from the analysis above."}
          </p>
        )}
      </div>
      {hint && question.hint && !checked ? (
        <p className="mt-2 text-xs text-muted-foreground">{question.hint}</p>
      ) : null}
    </fieldset>
  );
}

const QUALITY_BADGE = { best: "success", acceptable: "warning", poor: "high" } as const;
const QUALITY_TEXT = {
  best: "Best option",
  acceptable: "Acceptable",
  poor: "Poor choice",
} as const;

function Decision({
  decision,
  progress,
  dispatch,
}: {
  decision: StoryDecision;
  progress: StoryProgress;
  dispatch: (a: StoryAction) => void;
}) {
  const chosen = progress.decisions[decision.id];
  const picked = decision.options.find((o) => o.id === chosen);
  return (
    <fieldset
      className="rounded-lg border border-primary/30 bg-primary/5 p-3"
      data-testid="decision"
      data-decision={decision.id}
    >
      <legend className="px-1 text-[13px] font-semibold">Analyst decision</legend>
      <p className="text-[13px]">{decision.prompt}</p>
      {decision.context ? (
        <p className="mt-1 text-xs text-muted-foreground">{decision.context}</p>
      ) : null}
      <ul className="mt-2 space-y-1.5">
        {decision.options.map((o) => {
          const selected = o.id === chosen;
          return (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => dispatch({ type: "decide", decision: decision.id, option: o.id })}
                disabled={Boolean(chosen)}
                aria-pressed={selected}
                data-option={o.id}
                className={cn(
                  "w-full rounded-md border p-2 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default",
                  selected ? "border-primary/60 bg-card" : "border-border bg-card/60 hover:bg-card",
                  chosen && !selected && "opacity-70",
                )}
              >
                {o.text}
              </button>
            </li>
          );
        })}
      </ul>
      {picked ? (
        <div
          className="mt-2 rounded-md border border-border bg-card p-2.5 text-xs"
          role="status"
          data-testid="decision-feedback"
          data-quality={picked.quality}
        >
          <p className="mb-1 flex items-center gap-2 font-medium">
            You chose:{" "}
            <Badge variant={QUALITY_BADGE[picked.quality]}>{QUALITY_TEXT[picked.quality]}</Badge>
          </p>
          <p className="text-muted-foreground">{picked.feedback}</p>
          {picked.quality !== "best" ? (
            <p className="mt-1.5 text-muted-foreground">
              <span className="font-medium text-foreground/80">Stronger option: </span>
              {decision.options.find((o) => o.quality === "best")?.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

function StepCardImpl({
  step,
  index,
  total,
  progress,
  dispatch,
  latest,
}: {
  step: StoryStep;
  index: number;
  total: number;
  progress: StoryProgress;
  dispatch: (a: StoryAction) => void;
  latest: boolean;
}) {
  const first = step.events[0] ? new Date(step.events[0].timestamp).getTime() : 0;
  return (
    <Card
      className={cn("p-4", latest && "ring-1 ring-primary/30")}
      data-testid="story-step"
      data-step={step.id}
      aria-labelledby={`step-${step.id}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs text-muted-foreground">
            {step.time} · step {index + 1} of {total}
          </p>
          <h2 id={`step-${step.id}`} className="text-base font-semibold">
            {step.title}
          </h2>
        </div>
        {step.alert ? (
          <div className="flex items-center gap-2 text-xs" data-testid="step-alert">
            <span className="text-muted-foreground">Alert</span>
            <SeverityBadge severity={step.alert.severity as Severity} />
          </div>
        ) : null}
      </header>
      <p className="mt-2 text-[13px] text-foreground/90">{step.narrative}</p>

      <section className="mt-4" aria-label="Evidence">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Evidence
        </h3>
        <ul className="space-y-2">
          {step.evidence.map((e) => (
            <EvidenceItem
              key={e.id}
              evidence={e}
              found={progress.found.includes(e.id)}
              onToggle={() => dispatch({ type: "toggle-finding", id: e.id })}
            />
          ))}
        </ul>
      </section>

      <details className="mt-4 rounded-lg border border-border" data-testid="telemetry">
        <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
          Telemetry ({step.events.length} event{step.events.length === 1 ? "" : "s"})
        </summary>
        <div
          role="region"
          aria-label="Telemetry events, scrollable"
          tabIndex={0}
          className="max-h-72 overflow-auto border-t border-border outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <table className="w-full text-xs">
            <caption className="sr-only">Telemetry events for this step</caption>
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-2 py-1.5">
                  +Time
                </th>
                <th scope="col" className="px-2 py-1.5">
                  Host
                </th>
                <th scope="col" className="px-2 py-1.5">
                  Event
                </th>
              </tr>
            </thead>
            <tbody>
              {step.events.map((ev) => (
                <tr key={ev.index} className="border-t border-border/60 align-top">
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {formatOffset((new Date(ev.timestamp).getTime() - first) / 1000)}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px]">
                    {ev.host ?? "-"}
                  </td>
                  <td className="px-2 py-1.5">
                    <p className="break-all font-mono text-[11px]">{ev.raw}</p>
                    {ev.note ? (
                      <p className="mt-0.5 italic text-muted-foreground">{ev.note}</p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <section className="mt-4" aria-label="Detections">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Detections
        </h3>
        {step.detections.length ? (
          <ul className="space-y-1.5" data-testid="detections">
            {step.detections.map((d) => (
              <li
                key={d.slug}
                className="rounded-lg border border-border p-2.5 text-[13px]"
                data-detection={d.slug}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    {d.title}
                    <SeverityBadge severity={d.level as Severity} />
                    {d.is_correlation ? <Badge variant="accent">correlation</Badge> : null}
                  </p>
                  <span className="flex gap-3 text-xs">
                    <Link href={`/detections/${d.slug}`} className="text-primary hover:underline">
                      Rule
                    </Link>
                    <Link
                      href={`/detections/playground?rule=${d.slug}`}
                      className="text-primary hover:underline"
                    >
                      Playground
                    </Link>
                  </span>
                </div>
                {d.why ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {d.why.summary.replace(/`/g, "")}
                  </p>
                ) : null}
                {d.is_correlation ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Raised when {d.events.length} events in this step met the correlation condition.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No detection fired for this step. Read the telemetry yourself: absence of an alert is
            not absence of activity.
          </p>
        )}
      </section>

      {step.techniques.length ? (
        <section className="mt-4" aria-label="MITRE ATT&CK techniques">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            MITRE ATT&amp;CK
          </h3>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {step.techniques.map((t) => (
              <TechniqueChip key={t.id} id={t.id} name={t.name ?? undefined} />
            ))}
          </div>
        </section>
      ) : null}

      {step.questions.length || step.decision ? (
        <section className="mt-4 space-y-3" aria-label="Investigation">
          {step.questions.map((q) => (
            <Question key={q.id} question={q} progress={progress} dispatch={dispatch} />
          ))}
          {step.decision ? (
            <Decision decision={step.decision} progress={progress} dispatch={dispatch} />
          ) : null}
        </section>
      ) : null}
    </Card>
  );
}

/** The part of the progress a step actually shows: its evidence marks, answers and decision. */
export function stepProgressKey(step: StoryStep, progress: StoryProgress): string {
  const parts: string[] = [];
  for (const e of step.evidence) if (progress.found.includes(e.id)) parts.push(`f:${e.id}`);
  for (const q of step.questions) {
    parts.push(
      `q:${q.id}:${(progress.answers[q.id] ?? []).join(",")}:${progress.checked.includes(q.id)}`,
    );
  }
  if (step.decision) parts.push(`d:${progress.decisions[step.decision.id] ?? ""}`);
  return parts.join("|");
}

/**
 * Re-renders only when this step's own slice of progress changes, so marking evidence in one step
 * does not re-render every step above it (and its code blocks and tables).
 */
export const StepCard = memo(
  StepCardImpl,
  (a, b) =>
    a.step === b.step &&
    a.index === b.index &&
    a.total === b.total &&
    a.latest === b.latest &&
    a.dispatch === b.dispatch &&
    stepProgressKey(a.step, a.progress) === stepProgressKey(b.step, b.progress),
);
