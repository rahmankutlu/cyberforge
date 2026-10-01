"use client";

import type { Story } from "@cyberforge/types";
import { Badge, Button, Card, Progress, Skeleton, cn } from "@cyberforge/ui";
import {
  CheckCircle2,
  ChevronDown,
  FastForward,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";

import { TechniqueChip } from "@/components/badges";
import { StepCard } from "@/components/stories/step-card";
import { StoryFlow } from "@/components/stories/story-flow";
import {
  allRevealed,
  pipelineCounts,
  review,
  revealedSteps,
  type StoryAction,
  type StoryProgress,
} from "@/lib/story-state";
import { useStoryProgress } from "@/lib/use-story-progress";

// React Flow is only needed once a story is open, and only in the browser.
const AttackGraph = dynamic(
  () => import("@/components/stories/attack-graph").then((m) => m.AttackGraph),
  { ssr: false, loading: () => <Skeleton className="h-[30rem] w-full" /> },
);

const CATEGORY_LABEL: Record<string, string> = {
  isolate: "Isolate",
  credentials: "Credentials",
  block: "Block",
  eradicate: "Eradicate",
  monitor: "Monitor",
  communicate: "Communicate",
  other: "Other",
};

function Board({ story, progress }: { story: Story; progress: StoryProgress }) {
  const steps = revealedSteps(story, progress);
  const findings = steps.flatMap((s) => s.evidence).filter((e) => progress.found.includes(e.id));
  const techniques = [
    ...new Map(steps.flatMap((s) => s.techniques).map((t) => [t.id, t])).values(),
  ];
  const done = allRevealed(story, progress);
  return (
    <aside
      className="space-y-4 xl:sticky xl:top-4 xl:self-start"
      aria-label="Investigation board"
      data-testid="board"
    >
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Investigation board</h2>
        <div className="mt-3">
          <Progress value={progress.revealed} max={story.steps.length} label="Steps revealed" />
          <p
            className="mt-1.5 text-[11px] tabular-nums text-muted-foreground"
            data-testid="steps-revealed"
          >
            {progress.revealed} of {story.steps.length} steps revealed
          </p>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted/50 p-2">
            <dt className="text-muted-foreground">Findings marked</dt>
            <dd className="text-base font-semibold tabular-nums" data-testid="findings-count">
              {findings.length}
            </dd>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <dt className="text-muted-foreground">Techniques seen</dt>
            <dd className="text-base font-semibold tabular-nums">{techniques.length}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Findings
        </h3>
        {findings.length ? (
          <ul className="mt-2 space-y-1.5" data-testid="findings">
            {findings.map((f) => (
              <li key={f.id} className="flex gap-2 text-xs">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
                <span>{f.title}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Mark evidence as a finding when it changes what you think happened.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          MITRE ATT&amp;CK so far
        </h3>
        {techniques.length ? (
          <div className="mt-2 flex flex-col gap-1.5" data-testid="board-techniques">
            {techniques.map((t) => (
              <TechniqueChip key={t.id} id={t.id} name={t.name ?? undefined} />
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">None yet.</p>
        )}
        {done ? null : (
          <p className="mt-3 text-[11px] text-muted-foreground">
            More will appear as you reveal steps.
          </p>
        )}
      </Card>
    </aside>
  );
}

function Containment({
  story,
  progress,
  dispatch,
}: {
  story: Story;
  progress: StoryProgress;
  dispatch: (a: StoryAction) => void;
}) {
  const chosen = new Set(progress.containment);
  const missed = story.containment.filter((c) => c.quality === "recommended" && !chosen.has(c.id));
  return (
    <Card className="p-4" data-testid="containment" aria-labelledby="containment-h">
      <h2 id="containment-h" className="text-base font-semibold">
        Containment
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        You have seen the whole sequence. Choose the actions you would take now. Order and
        proportion matter: contain first, preserve evidence, then eradicate.
      </p>
      <ul className="mt-3 space-y-2">
        {story.containment.map((c) => {
          const on = chosen.has(c.id);
          const shown = progress.submitted;
          return (
            <li key={c.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-[13px] transition-colors",
                  on ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40",
                  shown && on && c.quality === "recommended" && "border-ok/50 bg-ok/8",
                  shown && on && c.quality === "harmful" && "border-sev-high/50 bg-sev-high/8",
                  shown && "cursor-default",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-[var(--primary)]"
                  checked={on}
                  disabled={shown}
                  onChange={() => dispatch({ type: "toggle-containment", id: c.id })}
                  data-action={c.id}
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    {c.action}
                    <Badge variant="outline">{CATEGORY_LABEL[c.category] ?? c.category}</Badge>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{c.effect}</span>
                  {shown && on ? (
                    <span
                      className="mt-1 block text-xs"
                      data-testid="containment-feedback"
                      data-quality={c.quality}
                    >
                      <Badge
                        variant={
                          c.quality === "recommended"
                            ? "success"
                            : c.quality === "harmful"
                              ? "high"
                              : "neutral"
                        }
                        className="mr-1.5"
                      >
                        {c.quality}
                      </Badge>
                      {c.feedback}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {progress.submitted ? (
        missed.length ? (
          <div
            className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs"
            data-testid="containment-missed"
          >
            <p className="font-medium">Recommended actions you did not choose</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
              {missed.map((m) => (
                <li key={m.id}>
                  {m.action}. {m.feedback}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-xs text-ok" role="status">
            <ShieldCheck className="size-4" aria-hidden /> Every recommended action was in your
            plan.
          </p>
        )
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            onClick={() => dispatch({ type: "submit-containment" })}
            disabled={progress.containment.length === 0}
            data-testid="submit-containment"
          >
            Submit containment plan
          </Button>
          {!progress.skipped ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dispatch({ type: "skip-to-review" })}
              data-testid="skip-review"
            >
              Read the post-incident explanation without submitting
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function Postmortem({ story, progress }: { story: Story; progress: StoryProgress }) {
  const r = review(story, progress);
  const pm = story.postmortem;
  return (
    <Card className="p-4" data-testid="postmortem" aria-labelledby="pm-h">
      <h2 id="pm-h" className="text-base font-semibold">
        Post-incident explanation
      </h2>
      <p className="mt-2 text-[13px]">{pm.summary}</p>

      <section className="mt-4" aria-label="Attack chain">
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          The attack chain
        </h3>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs" data-testid="attack-chain">
            <caption className="sr-only">
              Attack chain: tactic, technique and what the intruder did
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-2 py-1.5">
                  Tactic
                </th>
                <th scope="col" className="px-2 py-1.5">
                  Technique
                </th>
                <th scope="col" className="px-2 py-1.5">
                  What happened
                </th>
              </tr>
            </thead>
            <tbody>
              {story.attack_chain.map((c, i) => (
                <tr key={i} className="border-b border-border/60 align-top last:border-0">
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium">{c.tactic}</td>
                  <td className="px-2 py-1.5">
                    <TechniqueChip id={c.technique} name={c.technique_name ?? undefined} />
                  </td>
                  <td className="px-2 py-1.5 text-muted-foreground">{c.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section aria-label="Root cause">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Root cause
          </h3>
          <p className="text-[13px] text-muted-foreground">{pm.root_cause}</p>
        </section>
        <section aria-label="What worked">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What worked
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
            {pm.what_worked.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
        <section aria-label="What to improve">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What to improve
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
            {pm.what_to_improve.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
        {pm.detections_to_add.length ? (
          <section aria-label="Detections to add">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Detections to add
            </h3>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
              {pm.detections_to_add.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Write one in the{" "}
              <Link
                href="/detections/playground"
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                playground
              </Link>
              .
            </p>
          </section>
        ) : null}
      </div>

      <section className="mt-4" aria-label="Lessons learned">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Lessons learned
        </h3>
        <ol className="list-decimal space-y-1 pl-5 text-[13px]" data-testid="lessons">
          {pm.lessons.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
      </section>

      <section
        className="mt-4 rounded-lg border border-border bg-muted/30 p-3"
        aria-label="Your investigation"
        data-testid="review"
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Your investigation
        </h3>
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Questions answered correctly</dt>
            <dd className="tabular-nums">
              {r.questionsCorrect} of {r.questionsAnswered} answered ({r.questionsTotal} in total)
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Key evidence marked</dt>
            <dd className="tabular-nums">
              {r.keyEvidenceFound} of {r.keyEvidenceTotal}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Decisions: best option</dt>
            <dd className="tabular-nums">
              {r.decisionsBest} of {r.decisionsTotal}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Recommended containment chosen</dt>
            <dd className="tabular-nums">
              {r.recommendedChosen} of {r.recommendedTotal}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Harmful actions chosen</dt>
            <dd className="tabular-nums">{r.harmfulChosen}</dd>
          </div>
        </dl>
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {r.harmfulChosen === 0 ? (
            <CheckCircle2 className="size-3.5 text-ok" aria-hidden />
          ) : (
            <XCircle className="size-3.5 text-sev-high" aria-hidden />
          )}
          Counts, not a grade: the aim is to see where your reasoning differed from the analysis
          above.
        </p>
      </section>
    </Card>
  );
}

export function StoryPlayer({ story }: { story: Story }) {
  const { progress, dispatch } = useStoryProgress(story.slug, story);
  const steps = useMemo(() => revealedSteps(story, progress), [story, progress]);
  const counts = useMemo(() => pipelineCounts(story, progress), [story, progress]);
  const done = allRevealed(story, progress);
  const nextTime = story.steps[progress.revealed]?.time;
  const lastStep = useRef<HTMLDivElement>(null);
  const previous = useRef(progress.revealed);

  // Bring a newly revealed step into view, but never on the first render.
  useEffect(() => {
    if (progress.revealed > previous.current) {
      lastStep.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    previous.current = progress.revealed;
  }, [progress.revealed]);

  const showPostmortem = progress.submitted || progress.skipped;

  return (
    <div className="space-y-4" data-testid="story-player">
      <StoryFlow counts={counts} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          <Card className="p-4" data-testid="briefing">
            <h2 className="text-sm font-semibold">Briefing</h2>
            <p className="mt-1 text-[13px] text-foreground/90">{story.briefing}</p>
          </Card>

          <details open className="group" data-testid="graph-panel">
            <summary className="mb-2 flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold">
              <ChevronDown
                className="size-4 transition-transform group-[&:not([open])]:-rotate-90"
                aria-hidden
              />
              Investigation graph
            </summary>
            <AttackGraph steps={steps} />
          </details>

          {steps.map((step, i) => {
            const latest = i === steps.length - 1;
            return (
              <div key={step.id} ref={latest ? lastStep : undefined} className="scroll-mt-4">
                <StepCard
                  step={step}
                  index={i}
                  total={story.steps.length}
                  progress={progress}
                  dispatch={dispatch}
                  latest={latest}
                />
              </div>
            );
          })}

          {!done ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border p-3">
              <Button
                onClick={() => dispatch({ type: "reveal-next", total: story.steps.length })}
                data-testid="reveal-next"
              >
                Reveal next event <span className="font-mono text-xs opacity-80">{nextTime}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: "reveal-all", total: story.steps.length })}
                data-testid="reveal-all"
              >
                <FastForward /> Show the rest of the timeline
              </Button>
              <p className="text-xs text-muted-foreground">
                Finish reading this step first: answer the question or make the decision, then
                continue.
              </p>
            </div>
          ) : (
            <Containment story={story} progress={progress} dispatch={dispatch} />
          )}

          {done && showPostmortem ? <Postmortem story={story} progress={progress} /> : null}

          {progress.revealed > 1 || progress.found.length || showPostmortem ? (
            <div className="flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: "reset" })}
                data-testid="reset-story"
              >
                <RotateCcw /> Start this story again
              </Button>
            </div>
          ) : null}
        </div>

        <Board story={story} progress={progress} />
      </div>
    </div>
  );
}
