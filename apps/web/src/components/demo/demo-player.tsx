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
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { SeverityBadge } from "@/components/badges";
import { DemoEvidence } from "@/components/demo/demo-evidence";
import { DemoTimeline } from "@/components/demo/demo-timeline";
import {
  clockAt,
  processLines,
  SEVERITY_LEVELS,
  stateAt,
  tacticHeat,
  type DemoSpeed,
  type PipelineStage,
} from "@/lib/demo-engine";
import { localizeKnownCopy } from "@/lib/i18n/copy";
import { useLocale } from "@/components/i18n/locale-provider";
import { renderRich } from "@/lib/i18n/rich";

function useDemoClock(
  duration: number,
  initial: number,
  autoplay: boolean,
  initialSpeed: DemoSpeed,
) {
  const [{ elapsed, playing }, setPlayback] = useState({
    elapsed: initial,
    playing: autoplay && initial < duration,
  });
  const [speed, setSpeed] = useState(initialSpeed);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = ((now - last) / 1000) * speed;
      last = now;
      setPlayback((current) => {
        if (!current.playing) return current;
        const elapsed = Math.min(duration, current.elapsed + delta);
        return { elapsed, playing: elapsed < duration };
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, speed, duration]);

  function toggle() {
    setPlayback((current) => ({
      elapsed: current.elapsed >= duration ? 0 : current.elapsed,
      playing: !current.playing,
    }));
  }

  function seek(time: number) {
    setPlayback({ elapsed: Math.max(0, Math.min(time, duration)), playing: false });
  }

  return { elapsed, playing, speed, setSpeed, toggle, seek };
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
  initialEventId,
  autoplay = false,
  initialSpeed = 1,
}: {
  script: DemoScript;
  initialTime?: number;
  initialEventId?: string;
  autoplay?: boolean;
  initialSpeed?: DemoSpeed;
}) {
  const { locale, c, t } = useLocale();
  const [selectedEventId, setSelectedEventId] = useState(initialEventId);
  const sliderRef = useRef<HTMLInputElement>(null);
  const evidenceTrigger = useRef<HTMLElement | null>(null);
  const clock = useDemoClock(script.duration_seconds, initialTime, autoplay, initialSpeed);
  const state = useMemo(() => stateAt(script, clock.elapsed), [script, clock.elapsed]);
  const heat = useMemo(() => tacticHeat(script, state.techniques), [script, state.techniques]);
  const lines = useMemo(
    () => processLines(state.processNodes, state.processEdges),
    [state.processNodes, state.processEdges],
  );
  const shownEvents = [...state.events].reverse();
  const selectedEvent = state.events.find((event) => event.id === selectedEventId);
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

  function severityLabel(value: string) {
    const level = SEVERITY_LEVELS.find((level) => level === value);
    return locale === "tr" && level ? t(`severity.${level}`) : value;
  }

  function openEvidence(id: string, trigger: HTMLElement) {
    evidenceTrigger.current = trigger;
    clock.seek(clock.elapsed);
    setSelectedEventId(id);
  }

  function replayLink(eventId?: string) {
    const url = new URL(window.location.href);
    url.hash = "";
    url.search = new URLSearchParams({
      scenario: script.slug,
      t: String(clock.elapsed),
      speed: String(clock.speed),
    }).toString();
    if (eventId) url.searchParams.set("event", eventId);
    return url.href;
  }

  function restoreEvidenceFocus() {
    const trigger = evidenceTrigger.current;
    (trigger?.isConnected ? trigger : sliderRef.current)?.focus();
    evidenceTrigger.current = null;
  }

  return (
    <div className="space-y-4" data-testid="demo" data-elapsed={Math.floor(clock.elapsed)}>
      <DemoTimeline
        script={script}
        elapsed={clock.elapsed}
        playing={clock.playing}
        speed={clock.speed}
        onSpeed={clock.setSpeed}
        onToggle={clock.toggle}
        onSeek={clock.seek}
        copyLink={() => replayLink()}
        sliderRef={sliderRef}
      />
      {selectedEvent ? (
        <DemoEvidence
          event={selectedEvent}
          alerts={state.alerts.filter((alert) => alert.event_id === selectedEvent.id)}
          time={clockAt(script, selectedEvent.t)}
          copyLink={() => replayLink(selectedEvent.id)}
          onClose={() => setSelectedEventId(undefined)}
          restoreFocus={restoreEvidenceFocus}
        />
      ) : null}
      {/* Pipeline */}
      <ol
        className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-card p-1.5 sm:flex sm:flex-wrap sm:items-stretch sm:gap-x-0 sm:gap-y-2"
        aria-label={c("Detection pipeline")}
        data-testid="demo-pipeline"
        data-stage={state.stage}
      >
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const active = state.stage === stage.key;
          return (
            <li key={stage.key} className="flex min-w-0 items-center" data-stage={stage.key}>
              <div
                className={cn(
                  "min-w-0 flex-1 rounded-md px-2 py-1.5 transition-colors duration-300 sm:min-w-[6.25rem] sm:px-2.5",
                  active ? "bg-primary/15" : "",
                )}
              >
                <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  <Icon className="size-3 shrink-0" aria-hidden />{" "}
                  {localizeKnownCopy(locale, stage.label)}
                </p>
                <p className="truncate text-[13px] font-semibold tabular-nums">
                  {counts[stage.key] || "-"}
                </p>
              </div>
              {i < STAGES.length - 1 ? (
                <ChevronRight
                  className="mx-0.5 hidden size-3.5 shrink-0 text-muted-foreground/60 sm:block"
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      <p className="sr-only" role="status" aria-live="polite" data-testid="demo-announce">
        {latestAlert
          ? c("Latest alert: {{title}}, {{severity}} severity.", {
              title: latestAlert.title,
              severity: severityLabel(latestAlert.severity),
            })
          : c("No alerts yet")}
      </p>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,3.4fr)]">
        {/* Ingestion + process chain */}
        <div className="min-w-0 space-y-4">
          <Card className="p-4" aria-labelledby="ingest-h">
            <div className="mb-2 flex items-center justify-between">
              <h2 id="ingest-h" className="text-sm font-semibold">
                {c("Event ingestion")}
              </h2>
              <span
                className="text-xs tabular-nums text-muted-foreground"
                data-testid="events-count"
              >
                {c("{{shown}} of {{total}} events · {{matched}} matched", {
                  shown: state.events.length,
                  total: script.events.length,
                  matched: state.matchedEvents,
                })}
              </span>
            </div>
            <div
              className="max-h-[27rem] overflow-auto rounded-lg border border-border focus-visible:ring-2 focus-visible:ring-ring"
              role="region"
              aria-label={c("Event ingestion")}
              tabIndex={0}
            >
              <table className="w-full min-w-72 table-fixed text-xs" data-testid="demo-events">
                <caption className="sr-only">
                  {c("Telemetry as it is ingested, newest first")}
                </caption>
                <thead className="sticky top-0 z-[1] bg-card">
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="w-[4.5rem] px-2 py-1.5">
                      {c("Time")}
                    </th>
                    <th scope="col" className="w-[5.5rem] px-2 py-1.5">
                      {c("Host")}
                    </th>
                    <th scope="col" className="px-2 py-1.5">
                      {c("Event")}
                    </th>
                    <th scope="col" className="w-[4.5rem] px-2 py-1.5">
                      {c("Result")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shownEvents.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-8 text-center text-muted-foreground">
                        {c("Press Start demo. Synthetic telemetry begins to arrive.")}
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
                      <td>
                        <button
                          type="button"
                          onClick={(interaction) => openEvidence(e.id, interaction.currentTarget)}
                          aria-haspopup="dialog"
                          className="block w-full truncate rounded px-2 py-2 text-left font-mono text-[11px] text-foreground underline decoration-border underline-offset-4 hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          title={e.command_line ?? e.message}
                        >
                          {e.command_line ?? e.message}
                        </button>
                      </td>
                      <td className="px-2 py-1.5">
                        {e.detections.length ? (
                          <SeverityBadge severity={e.severity as Severity} />
                        ) : (
                          <span className="text-muted-foreground">{c("normal")}</span>
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
              {c("Process chain")}
            </h2>
            {lines.length ? (
              <ul className="space-y-1 font-mono text-xs" data-testid="process-chain">
                {lines.map(({ node, depth, accessed }) => (
                  <li
                    key={node.id}
                    className="flex flex-wrap items-center gap-1.5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
                    style={{ paddingInlineStart: Math.min(depth, 6) * 14 }}
                    data-flagged={node.flagged}
                  >
                    {depth > 0 ? (
                      <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                    ) : null}
                    <span
                      className={cn(
                        "min-w-0 break-all",
                        node.flagged ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {node.label}
                    </span>
                    {accessed ? <Badge variant="outline">{c("memory read")}</Badge> : null}
                    {node.flagged ? <Badge variant="high">{c("flagged")}</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {c("The chain appears when a detection flags a process.")}
              </p>
            )}
          </Card>
        </div>

        {/* Alerts + severity */}
        <div className="min-w-0 space-y-4">
          <Card className="p-4" aria-labelledby="sev-h">
            <h2 id="sev-h" className="text-sm font-semibold">
              {c("Incident severity")}
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
                {state.severity === "informational" ? c("Quiet") : severityLabel(state.severity)}
              </span>
              {state.severityHistory.length > 1 ? (
                <span className="text-xs text-muted-foreground" data-testid="severity-history">
                  {state.severityHistory
                    .slice(1)
                    .map((h) => severityLabel(h.severity))
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
                {c("SOC alerts")}
              </h2>
              <span
                className="text-xs tabular-nums text-muted-foreground"
                data-testid="alerts-count"
              >
                {state.alerts.length} {c("raised")}
              </span>
            </div>
            {state.alerts.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">{c("No alerts yet")}</p>
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
                        {c("Rule")}
                      </Link>
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-[11px]"
                        aria-haspopup="dialog"
                        onClick={(event) => openEvidence(a.event_id, event.currentTarget)}
                      >
                        {c("Inspect evidence")}
                      </Button>
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
              aria-label={c("Tactics with observed techniques")}
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
                  title={h.techniques.join(", ") || c("No technique observed")}
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
                  {c("Techniques appear as alerts map to ATT&CK.")}
                </li>
              ) : null}
            </ul>
          </Card>

          <Card className="p-4" aria-labelledby="inv-h">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="inv-h" className="text-sm font-semibold">
                {c("Investigation")}
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
                {c("Analyst notes appear as the investigation proceeds.")}
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
          {c("Incident summary")}
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
                  <dt className="text-[11px] text-muted-foreground">
                    {localizeKnownCopy(locale, label as string)}
                  </dt>
                  <dd className="text-base font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-muted-foreground">
              {c("Generated from the telemetry above by templates: no AI and no external service.")}{" "}
              {renderRich(
                c(
                  "Explore the same events in the <playground>playground</playground> or follow a longer case in <stories>Stories</stories>.",
                ),
                {
                  playground: (text) => (
                    <Link
                      href="/detections/playground"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                    >
                      {text}
                    </Link>
                  ),
                  stories: (text) => (
                    <Link
                      href="/stories"
                      className="text-primary underline underline-offset-2 hover:no-underline"
                    >
                      {text}
                    </Link>
                  ),
                },
              )}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            {c("The summary is written when the incident has been contained.")}
          </p>
        )}
      </Card>
    </div>
  );
}
