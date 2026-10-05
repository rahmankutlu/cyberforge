"use client";

import { cn } from "@cyberforge/ui";
import { ChevronRight } from "lucide-react";

import type { Pipeline } from "@/lib/story-state";
import { localizeKnownCopy } from "@/lib/i18n/copy";
import { useLocale } from "@/components/i18n/locale-provider";

const STAGES: { key: keyof Pipeline; label: string; unit: [string, string] }[] = [
  { key: "telemetry", label: "Telemetry", unit: ["event", "events"] },
  { key: "detections", label: "Detections", unit: ["rule fired", "rules fired"] },
  { key: "alerts", label: "Alerts", unit: ["alert", "alerts"] },
  { key: "techniques", label: "MITRE", unit: ["technique", "techniques"] },
  { key: "decisions", label: "Decisions", unit: ["made", "made"] },
  { key: "containment", label: "Containment", unit: ["action", "actions"] },
  { key: "lessons", label: "Lessons", unit: ["learned", "learned"] },
];

/** Telemetry → Detections → Alerts → MITRE → Decisions → Containment → Lessons, with live counts. */
export function StoryFlow({ counts }: { counts: Pipeline }) {
  const { locale, c } = useLocale();
  return (
    <ol
      className="flex flex-wrap items-stretch gap-y-2 rounded-lg border border-border bg-card p-1.5"
      aria-label={c("Investigation pipeline")}
      data-testid="story-flow"
    >
      {STAGES.map((stage, i) => {
        const n = counts[stage.key];
        const active = n > 0;
        return (
          <li key={stage.key} className="flex items-center" data-stage={stage.key} data-count={n}>
            <div
              className={cn(
                "min-w-[5.5rem] rounded-md px-2.5 py-1.5 transition-colors",
                active && "bg-primary/10",
              )}
            >
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {localizeKnownCopy(locale, stage.label)}
              </p>
              <p className="text-[13px] font-semibold tabular-nums">
                {n}{" "}
                <span className="text-[11px] font-normal text-muted-foreground">
                  {localizeKnownCopy(locale, stage.unit[n === 1 ? 0 : 1])}
                </span>
              </p>
            </div>
            {i < STAGES.length - 1 ? (
              <ChevronRight
                className="mx-0.5 size-3.5 shrink-0 text-muted-foreground/60"
                aria-hidden
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
