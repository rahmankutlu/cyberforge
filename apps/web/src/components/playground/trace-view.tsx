"use client";

import type {
  PlaygroundExplain,
  SigmaExplanation,
  SuricataExplanation,
  TraceItem,
  TraceSelection,
  YaraExplanation,
} from "@cyberforge/types";
import { Badge, cn } from "@cyberforge/ui";
import { AlertTriangle, CheckCircle2, CircleSlash, MinusCircle, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { highlightSegments } from "@/lib/highlight";
import { conditionSteps, matchedRows, OUTCOME_LABEL, showValue } from "@/lib/trace";
import { localizeKnownCopy } from "@/lib/i18n/copy";
import { useLocale } from "@/components/i18n/locale-provider";
import { renderRich } from "@/lib/i18n/rich";

/** Glyphs carry the meaning; colour only reinforces it. */
export function Mark({ ok, label }: { ok: boolean | null; label?: string }) {
  const { c } = useLocale();
  if (ok === null) {
    return (
      <span
        className="inline-flex items-center"
        role="img"
        aria-label={label ?? c("not applicable")}
      >
        <MinusCircle className="size-3.5 text-muted-foreground" aria-hidden />
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center"
      role="img"
      aria-label={label ?? (ok ? c("matched") : c("did not match"))}
    >
      {ok ? (
        <CheckCircle2 className="size-3.5 text-ok" aria-hidden />
      ) : (
        <XCircle className="size-3.5 text-muted-foreground" aria-hidden />
      )}
    </span>
  );
}

export function Highlighted({ text, needles }: { text: string; needles: string[] }) {
  const segments = highlightSegments(text, needles);
  return (
    <>
      {segments.map((s, i) =>
        s.match ? (
          <mark key={i} className="rounded-[3px] bg-primary/20 px-0.5 text-foreground">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

function SectionTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3
      id={id}
      className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
    >
      {children}
    </h3>
  );
}

function Banner({
  tone,
  label,
  children,
  nested = false,
}: {
  tone: "ok" | "miss" | "warn";
  label: string;
  children: ReactNode;
  /** Base-rule banners inside a correlation trace: same look, but not the page's main status. */
  nested?: boolean;
}) {
  return (
    <div
      role={nested ? undefined : "status"}
      data-testid={nested ? "base-outcome" : "match-outcome"}
      data-outcome={label}
      className={cn(
        "rounded-lg border p-3",
        tone === "ok" && "border-ok/40 bg-ok/8",
        tone === "miss" && "border-border bg-muted/40",
        tone === "warn" && "border-sev-medium/40 bg-sev-medium/8",
      )}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide">
        {tone === "ok" ? <CheckCircle2 className="size-4 text-ok" aria-hidden /> : null}
        {tone === "miss" ? (
          <CircleSlash className="size-4 text-muted-foreground" aria-hidden />
        ) : null}
        {tone === "warn" ? <AlertTriangle className="size-4 text-sev-medium" aria-hidden /> : null}
        {label}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-foreground/90">{children}</p>
    </div>
  );
}

function ItemRow({ item }: { item: TraceItem }) {
  const { c } = useLocale();
  const actual = showValue(item.actual);
  const needles = item.values.filter((v) => v.matched).map((v) => v.text);
  return (
    <li className="space-y-1 py-1.5">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
        <Mark ok={item.matched} />
        <span className="font-mono font-medium">{item.field ?? c("(any field)")}</span>
        <span className="text-muted-foreground">{item.operator}</span>
        {item.values.length > 1 ? (
          <span className="text-muted-foreground">
            {item.linking === "and" ? c("all of") : c("any of")}
          </span>
        ) : null}
      </p>
      <ul className="ml-5 flex flex-wrap gap-1" aria-label={c("Values checked")}>
        {item.values.map((v, i) => (
          <li
            key={i}
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[11px]",
              v.matched
                ? "border-ok/40 bg-ok/10 text-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            <span className="sr-only">
              {v.matched ? `${c("matched:")} ` : `${c("did not match:")} `}
            </span>
            {v.text || c("(empty)")}
          </li>
        ))}
      </ul>
      <p className="ml-5 break-all font-mono text-[11px] text-muted-foreground">
        {item.field ? `${c("event value:")} ` : `${c("searched all fields")} · `}
        {actual ? <Highlighted text={actual} needles={needles} /> : <em>{c("not present")}</em>}
      </p>
    </li>
  );
}

function SelectionBody({ selection }: { selection: TraceSelection }) {
  const { c } = useLocale();
  const alternatives = selection.linking === "or" && selection.children.length > 1;
  return (
    <ul className="mt-1 divide-y divide-border/60">
      {selection.children.map((child, i) => (
        <li key={i} className={cn(alternatives && "pt-1")}>
          {alternatives ? (
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {c("alternative {{index}} of {{total}}", {
                index: i + 1,
                total: selection.children.length,
              })}
              {child.matched ? ` · ${c("matched")}` : ""}
            </p>
          ) : null}
          {child.kind === "item" ? (
            <ul>
              <ItemRow item={child} />
            </ul>
          ) : (
            <SelectionBody selection={child} />
          )}
        </li>
      ))}
    </ul>
  );
}

function SelectionCard({ selection }: { selection: TraceSelection }) {
  const { c } = useLocale();
  return (
    <li
      data-testid={`selection-${selection.name}`}
      data-matched={selection.matched}
      className={cn("rounded-lg border p-3", selection.matched ? "border-ok/30" : "border-border")}
    >
      <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold">
        <Mark ok={selection.matched} />
        <span className="font-mono">{selection.name}</span>
        <Badge variant={selection.matched ? "success" : "neutral"}>
          {selection.matched ? c("matched") : c("did not match")}
        </Badge>
        {selection.name.startsWith("filter") ? (
          <Badge variant="outline">{c("exclusion")}</Badge>
        ) : null}
      </p>
      <SelectionBody selection={selection} />
    </li>
  );
}

const formatLogsource = (ls: Record<string, string>, empty: string) =>
  Object.entries(ls)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ") || empty;

export function SigmaTrace({ data, nested = false }: { data: SigmaExplanation; nested?: boolean }) {
  const { locale, c } = useLocale();
  const rows = matchedRows(data.selections);
  const steps = conditionSteps(data.condition);
  const tone =
    data.outcome === "matched" ? "ok" : data.outcome === "logsource_mismatch" ? "warn" : "miss";
  return (
    <div className="space-y-4" data-testid="sigma-trace">
      <Banner
        tone={tone}
        label={localizeKnownCopy(locale, OUTCOME_LABEL[data.outcome])}
        nested={nested}
      >
        {data.summary}
      </Banner>

      {data.outcome === "matched" && rows.length ? (
        <section aria-labelledby="why-matched">
          <SectionTitle id="why-matched">{c("Why it matched")}</SectionTitle>
          <ul className="space-y-1.5" data-testid="why-matched">
            {rows.map((r, i) => (
              <li key={i} className="rounded-lg border border-ok/30 bg-ok/5 p-2.5 text-xs">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-mono font-semibold">{r.field}</span>
                  <span className="text-muted-foreground">{r.operator}</span>
                  <span className="font-mono">&ldquo;{r.pattern}&rdquo;</span>
                </p>
                <dl className="mt-1.5 grid grid-cols-[4.5rem_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                  <dt className="text-muted-foreground">{c("Selector")}</dt>
                  <dd className="font-mono">{r.selection}</dd>
                  <dt className="text-muted-foreground">{c("Event value")}</dt>
                  <dd className="break-all font-mono">
                    <Highlighted text={r.actual} needles={[r.pattern]} />
                  </dd>
                </dl>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="selections-h">
        <SectionTitle id="selections-h">{c("Selections")}</SectionTitle>
        <ul className="space-y-2">
          {data.selections.map((s) => (
            <SelectionCard key={s.name} selection={s} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="condition-h">
        <SectionTitle id="condition-h">{c("Condition")}</SectionTitle>
        <p className="mb-1.5 rounded-md bg-muted/60 px-2 py-1.5 font-mono text-xs">
          {data.condition_text}
        </p>
        <ol
          className="space-y-0.5 text-xs"
          data-testid="condition-path"
          aria-label={c("Condition evaluation path")}
        >
          {steps.map((s, i) => (
            <li
              key={i}
              className="flex items-center gap-1.5"
              style={{ paddingLeft: `${s.depth * 14}px` }}
            >
              <Mark ok={s.matched} />
              <span className={cn("font-mono", s.op !== "selection" && "text-muted-foreground")}>
                {s.op === "and" || s.op === "or" ? s.op.toUpperCase() : s.label}
              </span>
              <span className="sr-only">{s.matched ? "true" : "false"}</span>
            </li>
          ))}
        </ol>
        <p
          className="mt-2 flex items-center gap-2 text-xs font-semibold"
          data-testid="trace-result"
        >
          {c("Result:")}
          <Badge variant={data.matched ? "success" : "neutral"}>
            {localizeKnownCopy(locale, OUTCOME_LABEL[data.outcome])}
          </Badge>
        </p>
      </section>

      <section aria-labelledby="logsource-h">
        <SectionTitle id="logsource-h">{c("Logsource")}</SectionTitle>
        <p className="text-xs text-muted-foreground">
          <Mark
            ok={data.logsource.compatible}
            label={data.logsource.compatible ? c("compatible") : c("incompatible")}
          />{" "}
          {renderRich(
            c("Rule reads <rule>{{rule}}</rule>; this event is <event>{{event}}</event>.", {
              rule: formatLogsource(data.logsource.rule, c("any source")),
              event: formatLogsource(data.logsource.event, c("unspecified")),
            }),
            {
              rule: (text) => <span className="font-mono text-foreground">{text}</span>,
              event: (text) => <span className="font-mono text-foreground">{text}</span>,
            },
          )}
        </p>
      </section>

      {data.hints.length ? (
        <section aria-labelledby="hints-h">
          <SectionTitle id="hints-h">{c("False-positive hints")}</SectionTitle>
          <ul
            className="list-disc space-y-1 pl-5 text-xs text-muted-foreground"
            data-testid="fp-hints"
          >
            {data.hints.map((h) => (
              <li key={h}>{h.replace(/`/g, "")}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function YaraTrace({ data, matched }: { data: YaraExplanation; matched: boolean }) {
  const { c } = useLocale();
  const label = data.unsupported ? "PREVIEW LIMIT" : matched ? "MATCHED" : "NO MATCH";
  const tone = data.unsupported ? "warn" : matched ? "ok" : "miss";
  return (
    <div className="space-y-4" data-testid="yara-trace">
      <Banner tone={tone} label={label}>
        {data.unsupported
          ? `${c("The preview evaluator cannot run this rule:")} ${data.unsupported}.`
          : matched
            ? c("The condition is true for this file.")
            : c("The condition is false for this file.")}
      </Banner>
      <section aria-labelledby="ystr">
        <SectionTitle id="ystr">{c("Strings")}</SectionTitle>
        <ul className="space-y-1.5">
          {data.strings.map((s) => (
            <li key={s.name} className="rounded-lg border border-border p-2 text-xs">
              <p className="flex flex-wrap items-center gap-2">
                <Mark ok={s.matched} />
                <span className="font-mono font-semibold">{s.name}</span>
                <Badge variant="outline">{s.kind}</Badge>
                {s.modifiers.map((m) => (
                  <Badge key={m} variant="outline">
                    {m}
                  </Badge>
                ))}
                <span className="text-muted-foreground">
                  {s.count} {c("occurrence")}
                  {s.offsets.length ? ` at ${s.offsets.slice(0, 4).join(", ")}` : ""}
                </span>
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {s.pattern}
              </p>
              {s.excerpt ? (
                <p className="mt-1 break-all rounded bg-muted/60 px-1.5 py-1 font-mono text-[11px]">
                  {s.excerpt}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="ycond">
        <SectionTitle id="ycond">{c("Condition")}</SectionTitle>
        <p className="mb-1.5 rounded-md bg-muted/60 px-2 py-1.5 font-mono text-xs">
          {data.condition_text}
        </p>
        <ol className="space-y-1 text-xs" data-testid="condition-path">
          {data.terms.map((t, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <Mark ok={t.matched} />
              <span className="font-mono">{t.label}</span>
              <span className="text-muted-foreground">{t.detail}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          {c("File size:")} {data.filesize} {c("bytes")}
        </p>
      </section>
    </div>
  );
}

function SuricataTrace({ data }: { data: SuricataExplanation }) {
  const { c } = useLocale();
  const tone = data.matched === null ? "warn" : data.matched ? "ok" : "miss";
  const label = data.matched === null ? "NOT APPLICABLE" : data.matched ? "MATCHED" : "NO MATCH";
  return (
    <div className="space-y-4" data-testid="suricata-trace">
      <Banner tone={tone} label={label}>
        {data.summary}
      </Banner>
      <section aria-labelledby="shead">
        <SectionTitle id="shead">{c("Header")}</SectionTitle>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">{c("Action")}</dt>
          <dd className="font-mono">{data.action}</dd>
          <dt className="text-muted-foreground">{c("Protocol")}</dt>
          <dd className="font-mono">{data.protocol}</dd>
          <dt className="text-muted-foreground">{c("Flow")}</dt>
          <dd className="font-mono">
            {data.source} {data.direction} {data.destination}
          </dd>
          <dt className="text-muted-foreground">{c("Message")}</dt>
          <dd>{data.msg}</dd>
          <dt className="text-muted-foreground">SID</dt>
          <dd className="font-mono">{data.sid}</dd>
        </dl>
      </section>
      <section aria-labelledby="schk">
        <SectionTitle id="schk">{c("Content checks")}</SectionTitle>
        {data.checks.length ? (
          <ul className="space-y-1.5">
            {data.checks.map((check, i) => (
              <li key={i} className="rounded-lg border border-border p-2 text-xs">
                <p className="flex flex-wrap items-center gap-2">
                  <Mark ok={check.actual === null ? null : check.matched} />
                  <span className="font-mono font-semibold">{check.buffer}</span>
                  <span className="text-muted-foreground">{check.kind}</span>
                  <span className="font-mono">&ldquo;{check.pattern}&rdquo;</span>
                  {check.modifiers.map((m) => (
                    <Badge key={m} variant="outline">
                      {m}
                    </Badge>
                  ))}
                </p>
                <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                  {check.actual === null
                    ? c("the event has no data for this buffer")
                    : `${c("event")}: ${check.actual}`}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            {c("This rule has no content or pcre options.")}
          </p>
        )}
      </section>
      <section aria-labelledby="sopt">
        <SectionTitle id="sopt">{c("All options")}</SectionTitle>
        <ul className="flex flex-wrap gap-1.5">
          {data.options.map((o, i) => (
            <li
              key={i}
              className="rounded border border-border px-1.5 py-0.5 font-mono text-[11px]"
            >
              {o.name}
              {o.value ? `:${o.value}` : ""}
            </li>
          ))}
        </ul>
        {data.not_evaluated.length ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {c("Not evaluated by the preview (they need packets or state):")}{" "}
            {data.not_evaluated.join(", ")}.
          </p>
        ) : null}
      </section>
    </div>
  );
}

function CorrelationTrace({ data }: { data: PlaygroundExplain }) {
  const { c } = useLocale();
  const corr = data.correlation;
  if (!corr) return null;
  const member = (data.member_of ?? []).length > 0;
  return (
    <div className="space-y-4" data-testid="correlation-trace">
      <Banner
        tone={member ? "ok" : "miss"}
        label={member ? c("PART OF A CORRELATION HIT") : c("NOT PART OF A HIT")}
      >
        {member
          ? c("This event is one of the events that satisfied the {{type}} condition.", {
              type: corr.type.replace("_", " "),
            })
          : c("This event is not part of any window that satisfied the correlation.")}
      </Banner>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{c("Type")}</dt>
        <dd className="font-mono">{corr.type}</dd>
        <dt className="text-muted-foreground">{c("Window")}</dt>
        <dd className="font-mono">{corr.timespan_seconds}s</dd>
        <dt className="text-muted-foreground">{c("Grouped by")}</dt>
        <dd className="font-mono">{corr.group_by.join(", ") || "nothing"}</dd>
      </dl>
      <section aria-labelledby="chits">
        <SectionTitle id="chits">{c("Hits")}</SectionTitle>
        {corr.hits.length ? (
          <ul className="space-y-1.5">
            {corr.hits.map((h, i) => (
              <li key={i} className="rounded-lg border border-border p-2 text-xs">
                <p className="font-medium">
                  {c("Hit")} {i + 1}: {h.event_indexes.length} {c("events")}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                  {JSON.stringify({ ...h.details, group: h.group })}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{c("No window satisfied the condition.")}</p>
        )}
      </section>
      {(data.bases ?? []).map((b) => (
        <section key={b.rule} aria-label={`Base rule ${b.rule}`}>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {c("Base rule:")} {b.rule}
          </h3>
          <SigmaTrace data={b} nested />
        </section>
      ))}
    </div>
  );
}

export function TraceView({ data }: { data: PlaygroundExplain }) {
  if (data.kind === "correlation") return <CorrelationTrace data={data} />;
  if (data.format === "yara") {
    return <YaraTrace data={data.explanation as YaraExplanation} matched={data.matched} />;
  }
  if (data.format === "suricata") {
    return <SuricataTrace data={data.explanation as SuricataExplanation} />;
  }
  return <SigmaTrace data={data.explanation as SigmaExplanation} />;
}
