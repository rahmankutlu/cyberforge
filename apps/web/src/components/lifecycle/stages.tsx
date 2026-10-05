import type { Lifecycle, SecurityEvent } from "@cyberforge/types";
import { Badge, Card, CardContent, EmptyState, Progress, cn } from "@cyberforge/ui";
import { CheckCircle2, ExternalLink, FlaskConical, ListChecks, ShieldQuestion } from "lucide-react";
import Link from "next/link";

import {
  AlertStatusBadge,
  SeverityBadge,
  SyntheticBadge,
  TechniqueChip,
} from "@/components/badges";
import { CodeBlock } from "@/components/code-block";
import { CreateInvestigationButton } from "@/components/soc/create-investigation-button";
import { formatDateTimeFull } from "@/lib/format";
import { highlightSegments, patternNeedles } from "@/lib/highlight";
import { useLocale } from "@/components/i18n/locale-provider";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

/** Values the rule matched on, used to highlight the raw log line. */
export function matchNeedles(data: Lifecycle): string[] {
  return data.match.trace.flatMap((t) => [
    ...(typeof t.value === "string" ? [t.value] : []),
    ...patternNeedles(t.pattern),
  ]);
}

// 1 ─ simulation ─────────────────────────────────────────────────────────────────────────────
export function SimulationStage({ data }: { data: Lifecycle }) {
  const { c } = useLocale();
  const sim = data.simulation;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {sim.lab ? (
            <Link
              href={`/labs/${sim.lab.slug}`}
              className="text-sm font-semibold hover:text-primary"
            >
              {c("Lab")} {String(sim.lab.number).padStart(2, "0")} · {sim.lab.title}
            </Link>
          ) : (
            <span className="text-sm font-semibold">{c("Background telemetry")}</span>
          )}
          {sim.synthetic ? (
            <SyntheticBadge />
          ) : (
            <Badge variant="success">{c("Live lab activity")}</Badge>
          )}
          {sim.run_id ? (
            <Badge variant="outline" className="font-mono">
              {c("run")} #{sim.run_id}
            </Badge>
          ) : null}
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{sim.description}</p>
        <p className="mt-3 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0" />
          {c(
            "Simulations replay telemetry only. No packets are sent to any system, inside or outside the lab.",
          )}
        </p>
      </div>
      {sim.narrative.length ? (
        <div>
          <SectionTitle>{c("What the simulation does")}</SectionTitle>
          <ol className="space-y-1.5">
            {sim.narrative.map((step, i) => (
              <li key={i} className="flex gap-2.5 text-[13px]">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

// 2 ─ raw event ──────────────────────────────────────────────────────────────────────────────
export function RawStage({ data, index }: { data: Lifecycle; index: number }) {
  const { locale, c } = useLocale();
  const event = data.raw_events[index];
  if (!event)
    return (
      <EmptyState
        title={c("No raw events")}
        description={c("This alert has no stored evidence events.")}
      />
    );
  const segments = highlightSegments(event.raw, matchNeedles(data));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="font-mono">
          {event.source}
        </Badge>
        <span>{formatDateTimeFull(event.timestamp, locale)}</span>
        <span>
          · {c("event #")}
          {event.id}
        </span>
      </div>
      <pre
        className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-5"
        data-testid="raw-event"
      >
        {segments.map((s, i) =>
          s.match ? (
            <mark key={i} className="rounded-sm bg-primary/20 px-0.5 text-foreground">
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </pre>
      <p className="mt-2 text-xs text-muted-foreground">
        {c(
          "Highlighted text is what the detection rule matched. Raw logs are unparsed: fields and structure are recovered in the next stage.",
        )}
      </p>
      {event.note ? (
        <p className="mt-3 rounded-md border border-border bg-muted/30 p-2.5 text-[13px]">
          <span className="mr-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {c("Analyst note")}
          </span>
          {event.note}
        </p>
      ) : null}
    </div>
  );
}

// 3 ─ parsed event ───────────────────────────────────────────────────────────────────────────
function Row({ k, v, matched }: { k: string; v: React.ReactNode; matched?: boolean }) {
  const { c } = useLocale();
  return (
    <tr className={cn("border-b border-border/60 last:border-0", matched && "bg-primary/8")}>
      <th
        scope="row"
        className="w-40 whitespace-nowrap py-1.5 pl-3 pr-3 text-left align-top text-xs font-normal text-muted-foreground"
      >
        {k}
        {matched ? (
          <span className="ml-1.5 rounded bg-primary/20 px-1 text-[9px] font-medium uppercase tracking-wide text-primary">
            {c("matched")}
          </span>
        ) : null}
      </th>
      <td className="break-all py-1.5 pr-3 font-mono text-xs">{v}</td>
    </tr>
  );
}

function display(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function ParsedStage({ data, index }: { data: Lifecycle; index: number }) {
  const { c } = useLocale();
  const event: SecurityEvent | undefined = data.parsed_events[index];
  if (!event) return <EmptyState title={c("No parsed events")} />;
  const matchedFields = new Set(data.match.trace.map((t) => t.field));
  const normalized: [string, string | number | null][] = [
    ["timestamp", event.timestamp],
    ["source", event.source],
    ["category", event.category],
    ["host", event.host],
    ["user", event.user],
    ["action", event.action],
    ["outcome", event.outcome],
    ["src_ip", event.src_ip],
    [
      "dst_ip",
      event.dst_ip ? `${event.dst_ip}${event.dst_port ? `:${event.dst_port}` : ""}` : null,
    ],
    ["process", event.process],
    ["parent_process", event.parent_process],
    ["command_line", event.command_line],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <SectionTitle>{c("Normalised event")}</SectionTitle>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full">
            <tbody>
              {normalized
                .filter(([, v]) => v !== null && v !== "")
                .map(([k, v]) => (
                  <Row key={k} k={k} v={String(v)} />
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{event.message}</p>
      </div>
      <div>
        <SectionTitle>{c("Sigma field map (what rules evaluate)")}</SectionTitle>
        <div className="overflow-hidden rounded-lg border border-border" data-testid="field-map">
          <table className="w-full">
            <tbody>
              {Object.entries(event.fields).map(([k, v]) => (
                <Row key={k} k={k} v={display(v)} matched={matchedFields.has(k)} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {c("Logsource")}:{" "}
          <span className="font-mono">
            {Object.entries(event.logsource)
              .map(([k, v]) => `${k}=${v}`)
              .join(", ")}
          </span>
          . {c("A rule only runs against events with a compatible logsource.")}
        </p>
      </div>
    </div>
  );
}

// 4 ─ rule match ─────────────────────────────────────────────────────────────────────────────
function highlightedRuleLines(content: string, fields: string[]): Set<number> {
  const out = new Set<number>();
  if (fields.length === 0) return out;
  const pattern = new RegExp(
    `^\\s*(?:-\\s*)?(?:${fields.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?:\\||:)`,
  );
  content.split("\n").forEach((line, i) => {
    if (pattern.test(line)) out.add(i + 1);
  });
  return out;
}

export function MatchStage({ data }: { data: Lifecycle }) {
  const { c } = useLocale();
  const rule = data.rule;
  if (!rule)
    return (
      <EmptyState
        icon={<ShieldQuestion />}
        title={c("No rule attached")}
        description={c("The rule that raised this alert was removed.")}
      />
    );
  const corr = data.match.correlation;
  const lines = highlightedRuleLines(rule.content, [
    ...new Set(data.match.trace.map((t) => t.field)),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Link
            href={`/detections/${rule.slug}`}
            className="text-sm font-semibold hover:text-primary"
          >
            {rule.title}
          </Link>
          <SeverityBadge severity={rule.level} />
          <Badge variant="outline" className="font-mono uppercase">
            {rule.format}
          </Badge>
          {rule.is_correlation ? <Badge variant="accent">{c("correlation")}</Badge> : null}
        </div>
        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{rule.description}</p>
        <CodeBlock
          code={rule.content}
          title={`${rule.slug}.yml`}
          maxHeight="22rem"
          highlightLines={lines}
        />
      </div>
      <div className="min-w-0">
        <SectionTitle>{c("Why it matched")}</SectionTitle>
        <p className="mb-3 text-[13px]" data-testid="match-explanation">
          {data.match.explanation}
        </p>
        {corr ? (
          <dl className="mb-3 grid grid-cols-2 gap-2 text-xs">
            {Object.entries(corr).map(([k, v]) => (
              <div key={k} className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {k.replace(/_/g, " ")}
                </dt>
                <dd className="font-mono">{String(v)}</dd>
              </div>
            ))}
            {data.match.group
              ? Object.entries(data.match.group).map(([k, v]) => (
                  <div
                    key={k}
                    className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
                  >
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {c("group by")} {k}
                    </dt>
                    <dd className="font-mono">{String(v)}</dd>
                  </div>
                ))
              : null}
          </dl>
        ) : null}
        {data.match.trace.length ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-xs" data-testid="match-trace">
              <thead className="bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 font-medium">{c("Field")}</th>
                  <th className="px-3 py-1.5 font-medium">{c("Event value")}</th>
                  <th className="px-3 py-1.5 font-medium">{c("Pattern")}</th>
                </tr>
              </thead>
              <tbody>
                {data.match.trace.map((t, i) => (
                  <tr key={i} className="border-t border-border/60 align-top">
                    <td className="px-3 py-1.5 font-mono">{t.field}</td>
                    <td className="break-all px-3 py-1.5 font-mono">{display(t.value)}</td>
                    <td className="break-all px-3 py-1.5 font-mono text-primary">{t.pattern}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {rule.false_positives.length ? (
          <div className="mt-4">
            <SectionTitle>{c("Potential false positives")}</SectionTitle>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
              {rule.false_positives.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// 5 ─ SOC alert ──────────────────────────────────────────────────────────────────────────────
export function AlertStage({ data, currentAlertId }: { data: Lifecycle; currentAlertId?: number }) {
  const { locale, c } = useLocale();
  const a = data.alert;
  return (
    <Card>
      <CardContent className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={a.severity} />
            <AlertStatusBadge status={a.status} />
            {a.synthetic ? <SyntheticBadge /> : null}
          </div>
          <p className="text-base font-semibold">{a.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {c("Alert #")}
            {a.id} · {formatDateTimeFull(a.timestamp, locale)} · {c("source")} {a.source}
          </p>
          {currentAlertId === a.id ? null : (
            <Link
              href={`/soc/alerts/${a.id}`}
              className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {c("Open alert")} <ExternalLink className="size-3" />
            </Link>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-muted-foreground">{c("Host")}</dt>
            <dd className="font-mono">{a.host ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{c("User")}</dt>
            <dd className="font-mono">{a.user ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{c("Assignee")}</dt>
            <dd>{a.assignee?.name ?? c("Unassigned")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{c("Confidence")}</dt>
            <dd className="mt-1">
              <Progress value={a.confidence} label={c("Confidence")} />
              <span className="tabular-nums">{a.confidence}%</span>
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

// 6 ─ MITRE ──────────────────────────────────────────────────────────────────────────────────
export function MitreStage({ data }: { data: Lifecycle }) {
  const { c } = useLocale();
  const m = data.mitre;
  if (!m.technique)
    return (
      <EmptyState title={c("No technique mapped")} description={c("This rule has no MITRE tag.")} />
    );
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TechniqueChip id={m.technique.id} name={m.technique.name} />
          {m.tactics.map((t) => (
            <Badge key={t.id} variant="accent">
              {t.name}
            </Badge>
          ))}
          <Badge variant="outline" className="uppercase">
            {m.technique.framework}
          </Badge>
        </div>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{m.description}</p>
        {m.url ? (
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {c("View on {{site}}", {
              site: m.technique.framework === "atlas" ? "MITRE ATLAS" : "attack.mitre.org",
            })}{" "}
            <ExternalLink className="size-3" />
          </a>
        ) : null}
        {m.other_techniques.length ? (
          <div className="mt-4">
            <SectionTitle>{c("Also mapped by this rule")}</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {m.other_techniques.map((t) => (
                <TechniqueChip key={t.id} id={t.id} name={t.name} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div>
        <SectionTitle>{c("MITRE mitigations")}</SectionTitle>
        {m.mitigations.length ? (
          <ul className="space-y-2">
            {m.mitigations.map((x) => (
              <li key={x.id} className="rounded-md border border-border p-2.5">
                <p className="text-[13px] font-medium">
                  <span className="mr-1.5 font-mono text-xs text-muted-foreground">{x.id}</span>
                  {x.name}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{x.description}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {c("No catalogued mitigations for this technique.")}
          </p>
        )}
      </div>
    </div>
  );
}

// 7 ─ investigation ──────────────────────────────────────────────────────────────────────────
export function InvestigationStage({ data }: { data: Lifecycle }) {
  const { c } = useLocale();
  const inv = data.investigation;
  if (!inv) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title={c("Not yet investigated")}
        description={c(
          "Group this alert into an investigation to track notes, a timeline and a report.",
        )}
        action={
          <CreateInvestigationButton
            alertId={data.alert.id}
            defaultTitle={data.alert.title}
            severity={data.alert.severity}
          />
        }
      />
    );
  }
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{inv.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {c("Investigation #")}
            {inv.id}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SeverityBadge severity={inv.severity} />
          <Badge variant="outline">{inv.status.replace("_", " ")}</Badge>
          <Link
            href={`/soc/investigations/${inv.id}`}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {c("Open")} <ExternalLink className="size-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// 8 ─ mitigation ─────────────────────────────────────────────────────────────────────────────
export function MitigationStage({ data }: { data: Lifecycle }) {
  const { c } = useLocale();
  const m = data.mitigation;
  const sourceLabel = {
    lab: c("Lab guidance"),
    mitre: c("MITRE ATT&CK mitigations"),
    none: c("No catalogued mitigations"),
  }[m.source];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div>
        <SectionTitle>
          {c("Mitigation")} · {sourceLabel}
        </SectionTitle>
        {m.actions.length ? (
          <ul className="space-y-2">
            {m.actions.map((action) => (
              <li key={action} className="flex gap-2 text-[13px]">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                <span>{action}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {c("No mitigation guidance is attached to this rule yet.")}
          </p>
        )}
      </div>
      <div>
        <SectionTitle>{c("Analyst recommendations")}</SectionTitle>
        <ol className="space-y-2">
          {m.analyst_steps.map((step, i) => (
            <li key={i} className="flex gap-2.5 text-[13px]">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
