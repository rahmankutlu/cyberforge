"use client";

import { Button, Progress, cn } from "@cyberforge/ui";
import { Check, CircleCheck } from "lucide-react";

import { progressFor, useLearningProgress } from "@/lib/learning-progress";

/** Progress is stored in this browser's localStorage. No account needed. */
export function TrackProgress({
  slugs,
  className,
  showLabel = true,
}: {
  slugs: string[];
  className?: string;
  showLabel?: boolean;
}) {
  const { completed } = useLearningProgress();
  const { done, total, pct } = progressFor(completed, slugs);
  return (
    <div className={className} data-testid="track-progress">
      <Progress value={done} max={Math.max(total, 1)} label="Track progress" />
      {showLabel ? (
        <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
          {done}/{total} complete · {pct}%
        </p>
      ) : null}
    </div>
  );
}

export function ModuleCheck({ slug, title }: { slug: string; title: string }) {
  const { isDone, toggle } = useLearningProgress();
  const done = isDone(slug);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`Mark “${title}” as ${done ? "not complete" : "complete"}`}
      onClick={() => toggle(slug)}
      data-done={done}
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        done
          ? "border-ok bg-ok text-background"
          : "border-border text-transparent hover:border-primary/60",
      )}
    >
      <Check className="size-3" />
    </button>
  );
}

export function CompleteButton({ slug }: { slug: string }) {
  const { isDone, toggle } = useLearningProgress();
  const done = isDone(slug);
  return (
    <Button
      variant={done ? "secondary" : "default"}
      onClick={() => toggle(slug)}
      data-testid="complete-module"
      aria-pressed={done}
    >
      <CircleCheck />
      {done ? "Completed" : "Mark as complete"}
    </Button>
  );
}

export function DayCell({
  slug,
  day,
  title,
  href,
}: {
  slug: string;
  day: number;
  title: string;
  href: string;
}) {
  const { isDone } = useLearningProgress();
  const done = isDone(slug);
  return (
    <a
      href={href}
      data-done={done}
      className={cn(
        "group flex h-full flex-col rounded-lg border p-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        done ? "border-ok/40 bg-ok/8" : "border-border bg-card hover:border-primary/40",
      )}
    >
      <span className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        Day {String(day).padStart(2, "0")}
        {done ? <CircleCheck className="size-3.5 text-ok" /> : null}
      </span>
      <span className="mt-1 text-[13px] font-medium leading-snug group-hover:text-primary">
        {title}
      </span>
    </a>
  );
}
