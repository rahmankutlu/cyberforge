"use client";

import type { DemoScript } from "@cyberforge/types";
import { Button, Card, cn } from "@cyberforge/ui";
import {
  Activity,
  Bell,
  FileText,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useMemo, type Ref } from "react";

import { CopyButton } from "@/components/code-block";
import { useLocale } from "@/components/i18n/locale-provider";
import { clockAt, DEMO_SPEEDS, demoMilestones, mmss, type DemoSpeed } from "@/lib/demo-engine";

const milestoneLabels = {
  event: { icon: Activity, label: "First event" },
  alert: { icon: Bell, label: "First alert" },
  escalation: { icon: TrendingUp, label: "Severity rises" },
  containment: { icon: ShieldCheck, label: "Host contained" },
  report: { icon: FileText, label: "Report ready" },
} as const;

export function DemoTimeline({
  script,
  elapsed,
  playing,
  speed,
  onSpeed,
  onToggle,
  onSeek,
  copyLink,
  sliderRef,
}: {
  script: DemoScript;
  elapsed: number;
  playing: boolean;
  speed: DemoSpeed;
  onSpeed: (speed: DemoSpeed) => void;
  onToggle: () => void;
  onSeek: (time: number) => void;
  copyLink: () => string;
  sliderRef: Ref<HTMLInputElement>;
}) {
  const { c } = useLocale();
  const milestones = useMemo(() => demoMilestones(script), [script]);
  const current = milestones.filter((point) => point.t <= elapsed).length - 1;
  const duration = script.duration_seconds;
  const timeLabel = `${mmss(elapsed)} / ${mmss(duration)}`;

  return (
    <Card
      className="gap-3 bg-linear-to-br from-primary/6 via-card to-card p-3 sm:p-4"
      aria-labelledby="demo-timeline-h"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="demo-timeline-h" className="text-sm font-semibold tracking-tight">
            {c("Incident timeline")}
          </h2>
          <p className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-xs tabular-nums text-muted-foreground">
            <span data-testid="demo-clock" title={c("Scenario clock")}>
              {clockAt(script, elapsed)}
            </span>
            <span data-testid="demo-elapsed">{timeLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onToggle} data-testid={playing ? "demo-pause" : "demo-start"}>
            {playing ? <Pause /> : <Play />}
            {playing
              ? c("Pause")
              : elapsed >= duration
                ? c("Replay")
                : elapsed
                  ? c("Resume")
                  : c("Start demo")}
          </Button>
          <Button
            variant="outline"
            onClick={() => onSeek(0)}
            data-testid="demo-reset"
            disabled={!elapsed && !playing}
          >
            <RotateCcw /> {c("Reset")}
          </Button>
          <div
            role="group"
            aria-label={c("Playback speed")}
            className="inline-flex rounded-md border border-border bg-card/60 p-0.5"
          >
            {DEMO_SPEEDS.map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => onSpeed(choice)}
                aria-pressed={speed === choice}
                data-testid={`demo-speed-${choice}`}
                className={cn(
                  "rounded px-2 py-1 text-xs font-medium tabular-nums focus-visible:ring-2 focus-visible:ring-ring",
                  speed === choice
                    ? "bg-primary/12 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {choice}x
              </button>
            ))}
          </div>
          <CopyButton text={copyLink} label={c("Copy replay link")} />
        </div>
      </div>

      <div className="relative flex h-7 items-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-2 h-1.5 rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary/80"
            style={{ width: `${(elapsed / duration) * 100}%` }}
          />
          {script.alerts.map((alert) => (
            <span
              key={alert.id}
              className={cn(
                "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-card",
                alert.t <= elapsed ? "bg-sev-high" : "bg-muted-foreground/55",
              )}
              style={{ left: `${(alert.t / duration) * 100}%` }}
            />
          ))}
        </div>
        <input
          ref={sliderRef}
          type="range"
          min={0}
          max={duration}
          step={1}
          value={Math.floor(elapsed)}
          onChange={(event) => onSeek(event.currentTarget.valueAsNumber)}
          aria-label={c("Playback position")}
          aria-valuetext={timeLabel}
          className="demo-scrubber relative z-10 h-7 w-full cursor-pointer rounded-md focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <ol
        aria-label={c("Incident milestones")}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex"
      >
        {milestones.map(({ kind, t }, index) => {
          const { icon: Icon, label } = milestoneLabels[kind];
          return (
            <li key={kind} className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onSeek(t)}
                aria-current={index === current ? "step" : undefined}
                className={cn(
                  "flex h-full min-h-12 w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring",
                  index === current
                    ? "border-primary/45 bg-primary/12"
                    : "border-border bg-card/75 hover:bg-muted/70",
                )}
              >
                <Icon
                  aria-hidden
                  className={cn(
                    "size-4 shrink-0",
                    index <= current ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium leading-tight">{c(label)}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {mmss(t)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
