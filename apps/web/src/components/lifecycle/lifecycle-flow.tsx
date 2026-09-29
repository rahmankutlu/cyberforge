"use client";

import type { Lifecycle } from "@cyberforge/types";
import { Button, Card, cn } from "@cyberforge/ui";
import {
  BellRing,
  Crosshair,
  FileText,
  FlaskConical,
  Grid3x3,
  Pause,
  Play,
  Radar,
  ShieldCheck,
  Table2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  AlertStage,
  InvestigationStage,
  MatchStage,
  MitigationStage,
  MitreStage,
  ParsedStage,
  RawStage,
  SimulationStage,
} from "@/components/lifecycle/stages";
import { SEVERITY_LABEL } from "@/lib/format";

export const STAGES = [
  { key: "simulation", label: "Simulation", icon: FlaskConical },
  { key: "raw", label: "Raw event", icon: FileText },
  { key: "parsed", label: "Parsed event", icon: Table2 },
  { key: "match", label: "Rule match", icon: Crosshair },
  { key: "alert", label: "SOC alert", icon: BellRing },
  { key: "mitre", label: "MITRE technique", icon: Grid3x3 },
  { key: "investigation", label: "Investigation", icon: Radar },
  { key: "mitigation", label: "Mitigation", icon: ShieldCheck },
] as const satisfies readonly { key: string; label: string; icon: LucideIcon }[];

export type StageKey = (typeof STAGES)[number]["key"];

function summary(key: StageKey, data: Lifecycle): string {
  switch (key) {
    case "simulation":
      return data.simulation.lab
        ? `Lab ${String(data.simulation.lab.number).padStart(2, "0")}`
        : data.simulation.run_id
          ? "Run"
          : "Dataset";
    case "raw":
      return `${data.raw_events.length} event${data.raw_events.length === 1 ? "" : "s"}`;
    case "parsed":
      return `${Object.keys(data.parsed_events[0]?.fields ?? {}).length} fields`;
    case "match":
      return data.match.correlation
        ? "Correlation"
        : `${data.match.trace.length} match${data.match.trace.length === 1 ? "" : "es"}`;
    case "alert":
      return SEVERITY_LABEL[data.alert.severity];
    case "mitre":
      return data.mitre.technique?.id ?? "None";
    case "investigation":
      return data.investigation ? `#${data.investigation.id}` : "None yet";
    case "mitigation":
      return `${data.mitigation.actions.length} actions`;
  }
}

/**
 * The signature CyberForge view: one alert traced from the simulated attack to its mitigation.
 * Every stage is clickable (and reachable with the arrow keys); "Play" walks through them.
 */
export function LifecycleFlow({
  data,
  initialStage = "simulation",
  currentAlertId,
}: {
  data: Lifecycle;
  initialStage?: StageKey;
  currentAlertId?: number;
}) {
  const [active, setActive] = useState<StageKey>(initialStage);
  const [eventIndex, setEventIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeIndex = STAGES.findIndex((s) => s.key === active);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setActive((current) => {
        const next = STAGES.findIndex((s) => s.key === current) + 1;
        if (next >= STAGES.length) {
          setPlaying(false);
          return current;
        }
        return STAGES[next]!.key;
      });
    }, 2200);
    return () => window.clearInterval(id);
  }, [playing]);

  const select = (key: StageKey) => {
    setPlaying(false);
    setActive(key);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = STAGES[(activeIndex + delta + STAGES.length) % STAGES.length]!;
    select(next.key);
    tabRefs.current[next.key]?.focus();
  };

  const showEventPicker = (active === "raw" || active === "parsed") && data.raw_events.length > 1;

  return (
    <section aria-label="Attack to detection lifecycle" data-testid="lifecycle">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Click a stage, or use{" "}
          <kbd className="rounded border border-border px-1 font-mono text-[10px]">←</kbd>{" "}
          <kbd className="rounded border border-border px-1 font-mono text-[10px]">→</kbd>.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            playing ? setPlaying(false) : (setActive("simulation"), setPlaying(true))
          }
        >
          {playing ? <Pause /> : <Play />}
          {playing ? "Pause" : "Play"}
        </Button>
      </div>

      <div className="overflow-x-auto pb-2">
        <div
          role="tablist"
          aria-label="Lifecycle stages"
          onKeyDown={onKeyDown}
          className="flex min-w-[760px] items-stretch"
        >
          {STAGES.map((stage, i) => {
            const on = stage.key === active;
            const reached = i <= activeIndex;
            const Icon = stage.icon;
            return (
              <div key={stage.key} className="flex flex-1 items-center">
                <button
                  ref={(el) => {
                    tabRefs.current[stage.key] = el;
                  }}
                  role="tab"
                  id={`${baseId}-tab-${stage.key}`}
                  aria-selected={on}
                  aria-controls={`${baseId}-panel`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => select(stage.key)}
                  data-stage={stage.key}
                  className={cn(
                    "group flex w-full min-w-[78px] flex-col items-center gap-1.5 rounded-lg border px-1.5 py-2.5 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    on
                      ? "border-primary/60 bg-primary/10"
                      : "border-border bg-card hover:border-primary/30 hover:bg-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md border transition-colors",
                      on
                        ? "border-primary/50 bg-primary text-primary-foreground"
                        : reached
                          ? "border-primary/40 text-primary"
                          : "border-border text-muted-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span
                    className={cn(
                      "text-[11px] font-medium leading-tight",
                      on ? "text-foreground" : "text-foreground/80",
                    )}
                  >
                    {stage.label}
                  </span>
                  <span className="max-w-full truncate text-[10px] leading-none text-muted-foreground">
                    {summary(stage.key, data)}
                  </span>
                </button>
                {i < STAGES.length - 1 ? (
                  <div aria-hidden className="mx-0.5 h-px w-3 shrink-0 overflow-hidden">
                    <div
                      className={cn("h-full w-full", i < activeIndex ? "flow-line" : "bg-border")}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <Card
        className="mt-3 p-4"
        role="tabpanel"
        id={`${baseId}-panel`}
        aria-labelledby={`${baseId}-tab-${active}`}
        tabIndex={0}
      >
        {showEventPicker ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Evidence event</span>
            {data.raw_events.slice(0, 12).map((e, i) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setEventIndex(i)}
                aria-pressed={i === eventIndex}
                className={cn(
                  "h-6 min-w-6 rounded border px-1.5 font-mono text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  i === eventIndex
                    ? "border-primary/60 bg-primary/12"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {i + 1}
              </button>
            ))}
            {data.raw_events.length > 12 ? (
              <span className="text-muted-foreground">of {data.raw_events.length}</span>
            ) : null}
          </div>
        ) : null}
        {active === "simulation" ? <SimulationStage data={data} /> : null}
        {active === "raw" ? <RawStage data={data} index={eventIndex} /> : null}
        {active === "parsed" ? <ParsedStage data={data} index={eventIndex} /> : null}
        {active === "match" ? <MatchStage data={data} /> : null}
        {active === "alert" ? <AlertStage data={data} currentAlertId={currentAlertId} /> : null}
        {active === "mitre" ? <MitreStage data={data} /> : null}
        {active === "investigation" ? <InvestigationStage data={data} /> : null}
        {active === "mitigation" ? <MitigationStage data={data} /> : null}
      </Card>
    </section>
  );
}
