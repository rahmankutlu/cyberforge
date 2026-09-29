"use client";

import type { DemoScript, Severity } from "@cyberforge/types";
import { Badge, Button, Card, cn } from "@cyberforge/ui";
import {
  Activity,
  ArrowRight,
  Bell,
  ChevronRight,
  Crosshair,
  FileText,
  Grid3x3,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SeverityBadge } from "@/components/badges";
import {
  clockAt,
  mmss,
  processLines,
  SEVERITY_LEVELS,
  stateAt,
  tacticHeat,
  type PipelineStage,
} from "@/lib/demo-engine";

const SPEEDS = [1, 2, 4] as const;
type Speed = (typeof SPEEDS)[number];

/** A clock that advances `speed` seconds per real second and can be paused, reset and set. */
function useDemoClock(duration: number, initial: number, autoplay: boolean, initialSpeed: Speed) {
  const [elapsed, setElapsed] = useState(initial);
  const [playing, setPlaying] = useState(autoplay && initial < duration);
  const [speed, setSpeed] = useState<Speed>(initialSpeed);
  const last = useRef(0);

  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = ((now - last.current) / 1000) * speed;
      last.current = now;
      setElapsed((e) => {
        const next = Math.min(duration, e + delta);
        if (next >= duration) setPlaying(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, speed, duration]);

  const start = useCallback(() => {
    setElapsed((e) => (e >= duration ? 0 : e));
    setPlaying(true);
  }, [duration]);
  const pause = useCallback(() => setPlaying(false), []);
  const reset = useCallback(() => {
    setPlaying(false);
    setElapsed(0);
  }, []);
  return { elapsed, playing, speed, setSpeed, start, pause, reset };
}

const STAGES: { key: PipelineStage; label: string; icon: typeof Activity }[] = [
  { key: "ingest", label: "Ingest", icon: Activity },
  { key: "detect", label: "Detect", icon: Crosshair },
  { key: "alert", label: "Alert", icon: Bell },
  { key: "mitre", label: "MITRE", icon: Grid3x3 },
  { key: "investigate", label: "Investigate", icon: Stethoscope },
  { key: "contain", label: "Contain", icon: ShieldCheck },
  { key: "summary", label: "Report", icon: FileText },
];

const CONTAINMENT_VARIANT = {
  monitoring: "neutral",
  containing: "warning",
  contained: "success",
} as const;
const SEVERITY_TONE: Record<string, string> = {
  informational: "text-muted-foreground",
  low: "text-sev-low",
  medium: "text-sev-medium",
  high: "text-sev-high",
  critical: "text-sev-critical",
};

export function DemoPlayer({
  script,
  initialTime = 0,
  autoplay = false,
  initialSpeed = 1,
}: {
  script: DemoScript;
  initialTime?: number;
  autoplay?: boolean;
  initialSpeed?: Speed;
}) {
  const clock = useDemoClock(script.duration_seconds, initialTime, autoplay, initialSpeed);
  const state = useMemo(() => stateAt(script, clock.elapsed), [script, clock.elapsed]);
  const heat = useMemo(() => tacticHeat(script, state.techniques), [script, state.techniques]);
  const lines = useMemo(
    () => processLines(state.processNodes, state.processEdges),
    [state.processNodes, state.processEdges],
  );
  const shownEvents = useMemo(() => [...state.events].reverse().slice(0, 14), [state.events]);
  const latestAlert = state.alerts[state.alerts.length - 1];
  const counts: Record<PipelineStage, string> = {
    idle: "",
    ingest: `${state.events.length}`,
    detect: `${state.matchedEvents}`,
    alert: `${state.alerts.length}`,
    mitre: `${state.techniques.length}`,
    investigate: `${state.notes.length}`,
    contain: state.containment.label,
    summary: state.summaryVisible ? "ready" : "-",
  };
  const started = clock.elapsed > 0;

  return (
    <div className="space-y-4" data-testid="demo" data-elapsed={Math.floor(clock.elapsed)}>
      {/* Controls */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            {clock.playing ? (
              <Button onClick={clock.pause} data-testid="demo-pause">
                <Pause /> Pause
              </Button>
            ) : (
              <Button onClick={clock.start} data-testid="demo-start">
                <Play /> {state.finished ? "Replay" : started ? "Resume" : "Start demo"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={clock.reset}
              data-testid="demo-reset"
              disabled={!started}
            >
              <RotateCcw /> Reset
            </Button>
          </div>
          <div
            role="group"
            aria-label="Playback speed"
            className="inline-flex rounded-md border border-border p-0.5"
          >
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => clock.setSpeed(s)}
                aria-pressed={clock.speed === s}
                data-testid={`demo-speed-${s}`}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-xs font-medium tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  clock.speed === s
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s}x
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-baseline gap-4 font-mono text-sm tabular-nums">
            <span data-testid="demo-clock" title="Scenario clock">
              {clockAt(script, clock.elapsed)}
            </span>
            <span className="text-muted-foreground" data-testid="demo-elapsed">
              {mmss(clock.elapsed)} / {mmss(script.duration_seconds)}
            </span>
          </div>
        </div>
        <div
          className="relative mt-3 h-1.5 rounded-full bg-muted"
          role="progressbar"
          aria-label="Demo progress"
          aria-valuemin={0}
          aria-valuemax={script.duration_seconds}
          aria-valuenow={Math.floor(clock.elapsed)}
        >
          <div
            className="h-full rounded-full bg-primary/80 transition-[width] duration-100 ease-linear"
            style={{ width: `${(clock.elapsed / script.duration_seconds) * 100}%` }}
          />
          {script.alerts.map((a) => (
            <span
              key={a.id}
              aria-hidden
              className={cn(
                "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-background",
                a.t <= clock.elapsed ? "bg-sev-high" : "bg-muted-foreground/40",
              )}
              style={{ left: `${(a.t / script.duration_seconds) * 100}%` }}
            />
          ))}
        </div>
      </Card>

      {/* Pipeline */}
      <ol
        className="flex flex-wrap items-stretch gap-y-2 rounded-lg border border-border bg-card p-1.5"
        aria-label="Detection pipeline"
        data-testid="demo-pipeline"
        data-stage={state.stage}
      >
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const active = state.stage === stage.key;
          return (
            <li key={stage.key} className="flex items-center" data-stage={stage.key}>
              <div
                className={cn(
                  "min-w-[6.25rem] rounded-md px-2.5 py-1.5 transition-colors duration-300",
                  active ? "bg-primary/15" : "",
                )}
              >
                <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Icon className="size-3" aria-hidden /> {stage.label}
                </p>
                <p className="truncate text-[13px] font-semibold tabular-nums">
                  {counts[stage.key] || "-"}
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

      <p className="sr-only" role="status" aria-live="polite" data-testid="demo-announce">
        {latestAlert
          ? `Latest alert: ${latestAlert.title}, ${latestAlert.severity} severity.`
          : "No alerts yet."}
      </p>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3.4fr)]">
        {/* Ingestion + process chain */}
        <div className="min-w-0 space-y-4">
          <Card className="p-4" aria-labelledby="ingest-h">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="ingest-h" className="text-sm font-semibold">
                Event ingestion
              </h2>
              <span
                className="text-xs tabular-nums text-muted-foreground"
                data-testid="events-count"
              >
                {state.events.length} of {script.events.length} events · {state.matchedEvents}{" "}
                matched
              </span>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full table-fixed text-xs" data-testid="demo-events">
                <caption className="sr-only">Telemetry as it is ingested, newest first</caption>
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="w-[4.5rem] px-2 py-1.5">
                      Time
                    </th>
                    <th scope="col" className="w-[5.5rem] px-2 py-1.5">
                      Host
                    </th>
                    <th scope="col" className="px-2 py-1.5">
                      Event
                    </th>
                    <th scope="col" className="w-[4.5rem] px-2 py-1.5">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shownEvents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-8 text-center text-muted-foreground">
                        Press Start demo. Synthetic telemetry begins to arrive.
                      </td>
                    </tr>
                  ) : null}
                  {shownEvents.map((e) => (
                    <tr
                      key={e.id}
                      data-testid="demo-event"
                      data-matched={e.detections.length > 0}
                      className={cn(
                        "border-b border-border/60 last:border-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
                        e.detections.length > 0 && "bg-sev-high/8",
                        e.severity === "critical" && "bg-sev-critical/10",
                      )}
                    >
                      <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                        {clockAt(script, e.t)}
                      </td>
                      <td className="truncate px-2 py-1.5 font-mono text-[11px]">{e.host}</td>
                      <td className="px-2 py-1.5">
                        <p
                          className="truncate font-mono text-[11px]"
                          title={e.command_line ?? e.message}
                        >
                          {e.command_line ?? e.message}
                        </p>
                      </td>
                      <td className="px-2 py-1.5">
                        {e.detections.length ? (
                          <SeverityBadge severity={e.severity as Severity} />
                        ) : (
                          <span className="text-muted-foreground">normal</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4" aria-labelledby="chain-h">
            <h2 id="chain-h" className="mb-2 text-sm font-semibold">
              Process chain
            </h2>
            {lines.length ? (
              <ul className="space-y-1 font-mono text-xs" data-testid="process-chain">
                {lines.map(({ node, depth, accessed }) => (
                  <li
                    key={node.id}
                    className="flex items-center gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
                    style={{ paddingLeft: `${depth * 14}px` }}
                    data-flagged={node.flagged}
                  >
                    {depth > 0 ? (
                      <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                    ) : null}
                    <span
                      className={cn(
                        node.flagged ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {node.label}
                    </span>
                    {accessed ? <Badge variant="outline">memory read</Badge> : null}
                    {node.flagged ? <Badge variant="high">flagged</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                The chain appears when a detection flags a process.
              </p>
            )}
          </Card>
        </div>

        {/* Alerts + severity */}
        <div className="min-w-0 space-y-4">
          <Card className="p-4" aria-labelledby="sev-h">
            <h2 id="sev-h" className="text-sm font-semibold">
              Incident severity
            </h2>
            <p className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "text-2xl font-semibold capitalize transition-colors duration-500",
                  SEVERITY_TONE[state.severity],
                )}
                data-testid="severity-current"
                data-severity={state.severity}
              >
                {state.severity === "informational" ? "Quiet" : state.severity}
              </span>
              {state.severityHistory.length > 1 ? (
                <span className="text-xs text-muted-foreground" data-testid="severity-history">
                  {state.severityHistory
                    .slice(1)
                    .map((h) => h.severity)
                    .join(" → ")}
                </span>
              ) : null}
            </p>
            <div className="mt-3 flex gap-1" aria-hidden>
              {SEVERITY_LEVELS.slice(1).map((level, i) => (
                <span
                  key={level}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors duration-500",
                    i + 1 <=
                      SEVERITY_LEVELS.indexOf(state.severity as (typeof SEVERITY_LEVELS)[number])
                      ? "bg-primary"
                      : "bg-muted",
                  )}
                />
              ))}
            </div>
          </Card>

          <Card className="p-4" aria-labelledby="alerts-h">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="alerts-h" className="text-sm font-semibold">
                SOC alerts
              </h2>
              <span
                className="text-xs tabular-nums text-muted-foreground"
                data-testid="alerts-count"
              >
                {state.alerts.length} raised
              </span>
            </div>
            {state.alerts.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No alerts yet.</p>
            ) : (
              <ul className="space-y-2" data-testid="demo-alerts">
                {[...state.alerts].reverse().map((a) => (
                  <li
                    key={a.id}
                    data-testid="alert-row"
                    data-severity={a.severity}
                    className="rounded-lg border border-border p-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {a.id} · {clockAt(script, a.t)}
                      </p>
                      <SeverityBadge severity={a.severity as Severity} />
                    </div>
                    <p className="mt-1 text-[13px] font-medium leading-snug">{a.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
                      <span className="font-mono">{a.host}</span>
                      {a.technique ? <span className="font-mono">{a.technique}</span> : null}
                      <Link href={`/detections/${a.rule}`} className="text-primary hover:underline">
                        Rule
                      </Link>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* MITRE + investigation */}
        <div className="min-w-0 space-y-4">
          <Card className="p-4" aria-labelledby="mitre-h">
            <h2 id="mitre-h" className="mb-2 text-sm font-semibold">
              MITRE ATT&amp;CK
            </h2>
            <ul
              className="grid grid-cols-3 gap-1.5"
              data-testid="mitre-heatmap"
              aria-label="Tactics with observed techniques"
            >
              {heat.map((h) => (
                <li
                  key={h.id}
                  data-testid="mitre-cell"
                  data-tactic={h.id}
                  data-count={h.count}
                  className={cn(
                    "rounded-md border px-1.5 py-1 text-[10px] leading-tight transition-colors duration-500",
                    h.count === 0 && "border-border text-muted-foreground",
                    h.count === 1 && "border-primary/30 bg-primary/15 text-foreground",
                    h.count >= 2 && "border-primary/50 bg-primary/30 text-foreground",
                  )}
                  title={h.techniques.join(", ") || "No technique observed"}
                >
                  <span className="block truncate">{h.name}</span>
                  <span className="font-mono tabular-nums">{h.count || "·"}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-3 space-y-1" data-testid="demo-techniques">
              {[...state.techniques]
                .reverse()
                .slice(0, 4)
                .map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 text-xs motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
                  >
                    <Link
                      href={`/mitre/${t.id}`}
                      className="font-mono text-primary hover:underline"
                    >
                      {t.id}
                    </Link>
                    <span className="truncate text-muted-foreground">{t.name}</span>
                  </li>
                ))}
              {state.techniques.length === 0 ? (
                <li className="text-xs text-muted-foreground">
                  Techniques appear as alerts map to ATT&amp;CK.
                </li>
              ) : null}
            </ul>
          </Card>

          <Card className="p-4" aria-labelledby="inv-h">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="inv-h" className="text-sm font-semibold">
                Investigation
              </h2>
              <Badge
                variant={CONTAINMENT_VARIANT[state.containment.state]}
                data-testid="containment-state"
                data-state={state.containment.state}
              >
                {state.containment.label}
              </Badge>
            </div>
            <p className="mb-3 text-[11px] text-muted-foreground">{state.containment.detail}</p>
            {state.notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Analyst notes appear as the investigation proceeds.
              </p>
            ) : (
              <ol className="space-y-2" data-testid="demo-notes">
                {[...state.notes]
                  .reverse()
                  .slice(0, 4)
                  .map((n) => (
                    <li
                      key={n.t}
                      className="border-l-2 border-primary/40 pl-2.5 text-xs motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
                    >
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {clockAt(script, n.t)} · {n.analyst}
                      </p>
                      <p className="mt-0.5 leading-snug">{n.body}</p>
                    </li>
                  ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      {/* Summary */}
      <Card
        className="p-4"
        aria-labelledby="summary-h"
        data-testid="incident-summary"
        data-ready={state.summaryVisible}
      >
        <h2 id="summary-h" className="text-sm font-semibold">
          Incident summary
        </h2>
        {state.summaryVisible ? (
          <div className="mt-2 space-y-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
            <p className="text-[15px] font-medium leading-snug" data-testid="summary-headline">
              {script.incident_summary.headline}
            </p>
            <div className="grid gap-x-8 gap-y-2 md:grid-cols-2">
              {script.incident_summary.paragraphs.map((p, i) => (
                <p key={i} className="text-[13px] text-muted-foreground">
                  {p}
                </p>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {[
                ["Events ingested", script.incident_summary.stats.events],
                ["Suspicious", script.incident_summary.stats.suspicious_events],
                ["Alerts", script.incident_summary.stats.alerts],
                ["Techniques", script.incident_summary.stats.techniques],
                ["Time to first alert", `${script.incident_summary.stats.seconds_to_first_alert}s`],
                [
                  "Time to containment",
                  script.incident_summary.stats.seconds_to_containment === null
                    ? "-"
                    : `${script.incident_summary.stats.seconds_to_containment}s`,
                ],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-md bg-muted/50 p-2">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className="text-base font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-muted-foreground">
              Generated from the telemetry above by templates: no AI and no external service.
              Explore the same events in the{" "}
              <Link href="/detections/playground" className="text-primary hover:underline">
                playground
              </Link>{" "}
              or follow a longer case in{" "}
              <Link href="/stories" className="text-primary hover:underline">
                Stories
              </Link>
              .
            </p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            The summary is written when the incident has been contained.
          </p>
        )}
      </Card>
    </div>
  );
}
