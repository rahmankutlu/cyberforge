"use client";

import type {
  PlaygroundDataset,
  PlaygroundDatasetDetail,
  PlaygroundExplain,
  PlaygroundItem,
  PlaygroundRun,
  RuleDetail,
  RuleFormat,
  TranslateResponse,
  Verdict,
} from "@cyberforge/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Kbd,
  Label,
  NativeSelect,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
} from "@cyberforge/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FlaskConical, Languages, Play, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { TranslationView } from "@/components/detections/translation-view";
import { Highlighted, Mark, TraceView } from "@/components/playground/trace-view";
import { apiGet, apiSend } from "@/lib/api";
import { useLocale } from "@/components/i18n/locale-provider";
import { countLabel } from "@/lib/i18n/copy";
import { formatOffset, matchNeedles, verdictLabel, type Filter } from "@/lib/playground";
import { readStorage, writeStorage } from "@/lib/persistent-storage";

const CUSTOM = "__custom__";
const NOTES_KEY = "cf.playground.notes";

const SAMPLE_EVENTS = `[
  {
    "category": "process_creation",
    "host": "WKS-014",
    "fields": {
      "Image": "C:\\\\Windows\\\\System32\\\\powershell.exe",
      "CommandLine": "powershell.exe -nop -w hidden -enc SQBFAFgA ",
      "ParentImage": "C:\\\\Windows\\\\System32\\\\cmd.exe"
    }
  },
  {
    "category": "process_creation",
    "host": "WKS-014",
    "fields": {
      "Image": "C:\\\\Windows\\\\System32\\\\cmd.exe",
      "CommandLine": "cmd.exe /c dir",
      "ParentImage": "C:\\\\Windows\\\\explorer.exe"
    }
  }
]`;

const SAMPLE_FILE = "Synthetic sample: paste text here to test a YARA rule against it.\n";

export interface PlaygroundProps {
  initialContent: string;
  initialFormat: RuleFormat;
  initialDataset: string;
  presets: { slug: string; title: string; format: RuleFormat }[];
  datasets: PlaygroundDataset[];
}

interface RunBody {
  content: string;
  format: RuleFormat;
  dataset?: string;
  events?: unknown[];
  files?: { name: string; content: string }[];
}

/** Rendered only while the Notes tab is open, so it can read storage without a hydration mismatch. */
function ScratchNotes() {
  const { c } = useLocale();
  const [notes, setNotes] = useState(() => readStorage(NOTES_KEY) ?? "");
  return (
    <div>
      <Label htmlFor="scratch-notes">{c("Your notes (kept in this browser only)")}</Label>
      <Textarea
        id="scratch-notes"
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          writeStorage(NOTES_KEY, e.target.value || null);
        }}
        className="mt-1 min-h-28 text-xs"
        placeholder={c("Ideas for filters, events to add, questions for the team…")}
      />
    </div>
  );
}

function verdictBadge(verdict: Verdict) {
  const label = verdictLabel(verdict);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <Mark
        ok={verdict === "matched" ? true : verdict === "no_match" ? false : null}
        label={label}
      />
      <span
        className={cn(
          verdict === "matched" ? "font-medium text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
}

export function Playground({
  initialContent,
  initialFormat,
  initialDataset,
  presets,
  datasets,
}: PlaygroundProps) {
  const { c } = useLocale();
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [format, setFormat] = useState<RuleFormat>(initialFormat);
  const [source, setSource] = useState(initialDataset);
  const [customEvents, setCustomEvents] = useState(SAMPLE_EVENTS);
  const [customFile, setCustomFile] = useState(SAMPLE_FILE);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState<{ body: RunBody; result: PlaygroundRun } | null>(null);
  const [rightTab, setRightTab] = useState("trace");
  const rowRefs = useRef(new Map<number, HTMLButtonElement>());
  const autoRan = useRef(false);
  /** Only the most recent run may update the page: an earlier, slower response is discarded. */
  const runSeq = useRef(0);

  const isCustom = source === CUSTOM;
  const dataset = datasets.find((d) => d.slug === source) ?? null;

  const detail = useQuery({
    queryKey: ["pg-dataset", source],
    queryFn: () => apiGet<PlaygroundDatasetDetail>(`/playground/datasets/${source}`),
    enabled: !isCustom,
    staleTime: Infinity,
  });

  const customItems: PlaygroundItem[] = useMemo(() => {
    if (!isCustom) return [];
    if (format === "yara") {
      return [
        {
          index: 0,
          kind: "file",
          title: "sample.txt",
          offset_seconds: 0,
          timestamp: null,
          category: null,
          source: null,
          host: null,
          user: null,
          raw: customFile,
          fields: {},
          note: null,
          size: customFile.length,
        },
      ];
    }
    try {
      const parsed: unknown = JSON.parse(customEvents);
      if (!Array.isArray(parsed)) return [];
      return parsed.map(
        (e: { category?: string; host?: string; fields?: Record<string, unknown> }, i) => ({
          index: i,
          kind: "event" as const,
          title: Object.entries(e.fields ?? {})
            .slice(0, 3)
            .map(([k, v]) => `${k}=${String(v)}`)
            .join(", "),
          offset_seconds: i,
          timestamp: null,
          category: e.category ?? null,
          source: null,
          host: e.host ?? null,
          user: null,
          raw: JSON.stringify(e.fields ?? {}),
          fields: e.fields ?? {},
          note: null,
          size: null,
        }),
      );
    } catch {
      return [];
    }
  }, [isCustom, format, customFile, customEvents]);

  const items = useMemo<PlaygroundItem[]>(
    () => (isCustom ? customItems : (detail.data?.items ?? [])),
    [isCustom, customItems, detail.data],
  );
  const verdicts = useMemo(
    () => new Map((lastRun?.result.results ?? []).map((r) => [r.index, r] as const)),
    [lastRun],
  );

  const buildBody = useCallback((): RunBody => {
    const body: RunBody = { content, format };
    if (!isCustom) return { ...body, dataset: source };
    if (format === "yara") return { ...body, files: [{ name: "sample.txt", content: customFile }] };
    return { ...body, events: JSON.parse(customEvents) as unknown[] };
  }, [content, format, isCustom, source, customFile, customEvents]);

  const run = useMutation({
    mutationFn: async () => {
      const seq = ++runSeq.current;
      let body: RunBody;
      try {
        body = buildBody();
      } catch {
        throw new Error(
          "The custom events must be valid JSON: an array of {category, fields} objects.",
        );
      }
      const result = await apiSend<PlaygroundRun>("POST", "/playground/run", body);
      return { body, result, seq };
    },
    onSuccess: ({ body, result, seq }) => {
      if (seq !== runSeq.current) return;
      setLastRun({ body, result });
      const firstMatch = result.results.find((r) => r.verdict === "matched");
      setSelected(firstMatch?.index ?? (result.results.length ? 0 : null));
      setRightTab("trace");
    },
    onError: (e: Error) => toast.error(c("Could not run the rule"), { description: e.message }),
  });

  const explain = useQuery({
    queryKey: ["pg-explain", lastRun?.body, selected],
    queryFn: () =>
      apiSend<PlaygroundExplain>("POST", "/playground/explain", {
        ...lastRun!.body,
        index: selected,
      }),
    enabled: lastRun !== null && lastRun.result.valid && selected !== null,
    staleTime: Infinity,
  });

  const translations = useQuery({
    queryKey: ["pg-translate", lastRun?.body.content],
    queryFn: () =>
      apiSend<TranslateResponse>("POST", "/detections/translate", {
        content: lastRun!.body.content,
      }),
    enabled:
      rightTab === "translations" && lastRun?.body.format === "sigma" && !!lastRun?.result.valid,
    staleTime: Infinity,
  });

  // Run once on load so the page opens populated: a rule, a dataset, matches and a trace.
  useEffect(() => {
    if (autoRan.current || isCustom || !detail.data) return;
    autoRan.current = true;
    run.mutate();
  }, [detail.data, isCustom, run]);

  // Keep the URL shareable without triggering navigation.
  useEffect(() => {
    if (typeof window === "undefined" || isCustom) return;
    const url = new URL(window.location.href);
    url.searchParams.set("dataset", source);
    window.history.replaceState(null, "", url);
  }, [source, isCustom]);

  const load = useMutation({
    mutationFn: (slug: string) => apiGet<RuleDetail>(`/detections/${slug}`),
    onSuccess: (rule) => {
      setContent(rule.content);
      setFormat(rule.format);
      const suited = datasets.find((d) => d.expected_rules.some((r) => r.slug === rule.slug));
      const keep = datasets.find((d) => d.slug === source);
      const wanted = rule.format === "yara" ? "files" : "events";
      const next =
        suited ?? (keep?.kind === wanted ? keep : datasets.find((d) => d.kind === wanted));
      if (next) setSource(next.slug);
      setLastRun(null);
      setSelected(null);
      autoRan.current = false;
      toast.message(`Loaded ${rule.title}`);
    },
    onError: (e: Error) => toast.error(c("Could not load the rule"), { description: e.message }),
  });

  const save = useMutation({
    mutationFn: () => apiSend<RuleDetail>("POST", "/detections", { content, format: "sigma" }),
    onSuccess: (rule) => {
      toast.success(c("Rule saved"), { description: rule.title });
      router.push(`/detections/${rule.slug}`);
    },
    onError: (e: Error) => toast.error(c("Could not save the rule"), { description: e.message }),
  });

  const changeFormat = (next: RuleFormat) => {
    setFormat(next);
    setLastRun(null);
    setSelected(null);
    if (!isCustom) {
      const wanted = next === "yara" ? "files" : "events";
      if (dataset?.kind !== wanted) {
        const alt = datasets.find((d) => d.kind === wanted);
        if (alt) setSource(alt.slug);
      }
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((it) => {
      const v = verdicts.get(it.index)?.verdict;
      if (filter === "matched" && v !== "matched") return false;
      if (filter === "unmatched" && v === "matched") return false;
      if (!needle) return true;
      return `${it.title} ${it.host ?? ""} ${it.category ?? ""} ${it.user ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [items, verdicts, filter, query]);

  const moveSelection = (delta: number) => {
    if (!visible.length) return;
    const at = visible.findIndex((it) => it.index === selected);
    const next = visible[Math.min(visible.length - 1, Math.max(0, (at === -1 ? 0 : at) + delta))];
    if (!next) return;
    setSelected(next.index);
    rowRefs.current.get(next.index)?.focus();
  };

  const stale =
    lastRun !== null && (lastRun.body.content !== content || lastRun.body.format !== format);
  const result = lastRun?.result;
  const selectedItem = items.find((it) => it.index === selected) ?? null;
  const matchedCount = result?.matched_count ?? 0;
  const tooLarge = new Blob([content]).size > 64 * 1024;
  const explainMatchedValues = useMemo(() => matchNeedles(explain.data), [explain.data]);

  return (
    <div
      className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1.3fr)]"
      data-testid="playground"
    >
      {/* LEFT: rule */}
      <section aria-label={c("Rule editor")} className="min-w-0">
        <Card className="p-4">
          <Tabs defaultValue="rule">
            <TabsList>
              <TabsTrigger value="rule" data-testid="tab-rule">
                {c("Rule")}
              </TabsTrigger>
              <TabsTrigger value="notes" data-testid="tab-notes">
                {c("Notes")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="rule" className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <Label htmlFor="preset">{c("Load an existing rule")}</Label>
                  <NativeSelect
                    id="preset"
                    value=""
                    onChange={(e) => e.target.value && load.mutate(e.target.value)}
                    className="mt-1"
                  >
                    <option value="">{c("Choose a rule…")}</option>
                    {(["sigma", "yara", "suricata"] as const).map((f) => (
                      <optgroup key={f} label={f.toUpperCase()}>
                        {presets
                          .filter((p) => p.format === f)
                          .map((p) => (
                            <option key={p.slug} value={p.slug}>
                              {p.title}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </NativeSelect>
                </div>
                <div className="w-28">
                  <Label htmlFor="format">{c("Format")}</Label>
                  <NativeSelect
                    id="format"
                    value={format}
                    onChange={(e) => changeFormat(e.target.value as RuleFormat)}
                    className="mt-1"
                  >
                    <option value="sigma">Sigma</option>
                    <option value="yara">YARA</option>
                    <option value="suricata">Suricata</option>
                  </NativeSelect>
                </div>
              </div>

              <Textarea
                aria-label={c("Rule source")}
                data-testid="rule-editor"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                    e.preventDefault();
                    run.mutate();
                  }
                }}
                spellCheck={false}
                className="min-h-[26rem] resize-y font-mono text-xs leading-5"
                maxLength={70000}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p
                  className={cn(
                    "text-[11px]",
                    tooLarge ? "text-sev-critical" : "text-muted-foreground",
                  )}
                >
                  {c("{{count}} characters · runs locally", {
                    count: content.length.toLocaleString(),
                  })}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {format === "sigma" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => save.mutate()}
                      disabled={save.isPending || !content.trim() || tooLarge || !result?.valid}
                      data-testid="save-rule"
                    >
                      <Save /> {c("Save")}
                    </Button>
                  ) : null}
                  <Button
                    onClick={() => run.mutate()}
                    disabled={run.isPending || !content.trim() || tooLarge}
                    data-testid="run-rule"
                  >
                    <Play /> {run.isPending ? c("Running…") : c("Run rule")}
                    <Kbd className="ml-1 hidden sm:inline-flex">⌘↵</Kbd>
                  </Button>
                </div>
              </div>

              {result && !result.valid ? (
                <ul className="space-y-1.5" aria-label={c("Errors")} data-testid="rule-errors">
                  {result.errors.map((e, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-sev-critical/30 bg-sev-critical/8 p-2.5 text-xs break-words"
                    >
                      {e}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result?.valid && result.warnings.length ? (
                <ul className="space-y-1.5" aria-label={c("Warnings")}>
                  {result.warnings.map((w, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-sev-medium/30 bg-sev-medium/8 p-2 text-[11px] break-words"
                    >
                      {w}
                    </li>
                  ))}
                </ul>
              ) : null}
              {stale ? (
                <p className="text-[11px] text-sev-medium" role="status">
                  {c("The rule changed since the last run. Run it again to refresh the results.")}
                </p>
              ) : null}
            </TabsContent>

            <TabsContent value="notes" className="space-y-3">
              {result?.meta ? (
                <div className="space-y-3 text-[13px]" data-testid="rule-notes">
                  <div>
                    <h3 className="text-sm font-semibold">{result.meta.title}</h3>
                    <p className="mt-0.5 flex flex-wrap gap-1.5">
                      <Badge
                        variant={
                          (["critical", "high", "medium", "low"].includes(result.meta.level)
                            ? result.meta.level
                            : "info") as "critical" | "high" | "medium" | "low" | "info"
                        }
                      >
                        {result.meta.level}
                      </Badge>
                      {result.meta.status ? (
                        <Badge variant="outline">{result.meta.status}</Badge>
                      ) : null}
                      {result.meta.is_correlation ? (
                        <Badge variant="accent">{c("correlation")}</Badge>
                      ) : null}
                    </p>
                  </div>
                  {result.meta.description ? (
                    <p className="text-muted-foreground">{result.meta.description}</p>
                  ) : null}
                  <div>
                    <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {c("Known false positives")}
                    </h4>
                    {result.meta.falsepositives.length ? (
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                        {result.meta.falsepositives.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-muted-foreground">
                        {c("None documented. Add falsepositives to help analysts.")}
                      </p>
                    )}
                  </div>
                  {result.meta.references.length ? (
                    <div>
                      <h4 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {c("References")}
                      </h4>
                      <ul className="mt-1 space-y-0.5">
                        {result.meta.references.map((r) => (
                          <li key={r} className="break-all">
                            <a
                              className="text-primary hover:underline"
                              href={r}
                              target="_blank"
                              rel="noreferrer noopener"
                            >
                              {r}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {c("Run the rule to see its description, false positives and references.")}
                </p>
              )}
              <ScratchNotes />
            </TabsContent>
          </Tabs>
        </Card>
      </section>

      {/* CENTER: test data */}
      <section aria-label={c("Test data")} className="min-w-0">
        <Card className="p-4">
          <Tabs defaultValue="data">
            <TabsList>
              <TabsTrigger value="data" data-testid="tab-test-data">
                {c("Test Data")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="data" className="space-y-3">
              <div>
                <Label htmlFor="dataset">{c("Dataset")}</Label>
                <NativeSelect
                  id="dataset"
                  value={source}
                  onChange={(e) => {
                    setSource(e.target.value);
                    setLastRun(null);
                    setSelected(null);
                    autoRan.current = true;
                  }}
                  className="mt-1"
                  data-testid="dataset-select"
                >
                  {(["events", "files"] as const).map((kind) => (
                    <optgroup
                      key={kind}
                      label={
                        kind === "events"
                          ? c("Event datasets (Sigma, Suricata)")
                          : c("File datasets (YARA)")
                      }
                    >
                      {datasets
                        .filter((d) => d.kind === kind)
                        .map((d) => (
                          <option
                            key={d.slug}
                            value={d.slug}
                          >{`${d.name} (${d.item_count})`}</option>
                        ))}
                    </optgroup>
                  ))}
                  <option value={CUSTOM}>{c("Custom…")}</option>
                </NativeSelect>
              </div>

              {dataset ? (
                <div
                  className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs"
                  data-testid="dataset-info"
                >
                  <p className="text-muted-foreground">{dataset.description}</p>
                  <p className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline">{dataset.source_type}</Badge>
                    <Badge variant="outline">
                      {dataset.item_count} {dataset.kind === "files" ? "files" : "events"}
                    </Badge>
                    <Badge variant="outline">{dataset.difficulty}</Badge>
                    {dataset.mitre.map((m) => (
                      <Link key={m.id} href={`/mitre/${m.id}`} title={m.name ?? undefined}>
                        <Badge variant="outline" className="font-mono hover:bg-muted">
                          {m.id}
                        </Badge>
                      </Link>
                    ))}
                  </p>
                  <div>
                    <p className="font-medium text-foreground/80">{c("Expected to match")}</p>
                    <ul className="mt-1 flex flex-wrap gap-1.5">
                      {dataset.expected_rules.map((r) => (
                        <li key={r.slug}>
                          <button
                            type="button"
                            onClick={() => load.mutate(r.slug)}
                            className="rounded-md border border-border px-1.5 py-0.5 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                            title={`${c("Load")} ${r.title}`}
                          >
                            <span className="text-[10px] uppercase text-muted-foreground">
                              {r.format}
                            </span>{" "}
                            {r.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {dataset.try_this.length ? (
                    <details>
                      <summary className="cursor-pointer font-medium text-foreground/80">
                        {c("Try this")}
                      </summary>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                        {dataset.try_this.map((t) => (
                          <li key={t}>{t}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : (
                <div>
                  {format === "yara" ? (
                    <>
                      <Label htmlFor="custom-file">{c("Sample file (text)")}</Label>
                      <Textarea
                        id="custom-file"
                        value={customFile}
                        onChange={(e) => setCustomFile(e.target.value)}
                        spellCheck={false}
                        rows={8}
                        className="mt-1 font-mono text-xs"
                      />
                    </>
                  ) : (
                    <>
                      <Label htmlFor="custom-events">
                        {c("Events (JSON array of objects)")} {"{category, host?, fields}"}
                      </Label>
                      <Textarea
                        id="custom-events"
                        value={customEvents}
                        onChange={(e) => setCustomEvents(e.target.value)}
                        spellCheck={false}
                        rows={10}
                        className="mt-1 font-mono text-xs"
                        data-testid="custom-events"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {c(
                          "Field names follow the Sigma vocabulary (Image, CommandLine, c-ip…). The category selects the logsource.",
                        )}
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  role="group"
                  aria-label={c("Filter events")}
                  className="inline-flex rounded-md border border-border p-0.5"
                >
                  {(["all", "matched", "unmatched"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={filter === f}
                      onClick={() => setFilter(f)}
                      data-testid={`filter-${f}`}
                      className={cn(
                        "rounded-[5px] px-2 py-1 text-xs font-medium capitalize focus-visible:ring-2 focus-visible:ring-ring",
                        filter === f
                          ? "bg-card text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {f === "all"
                        ? `${c("All")} ${items.length}`
                        : f === "matched"
                          ? `${c("Matched")} ${matchedCount}`
                          : `${c("Not matched")} ${Math.max(0, items.length - matchedCount)}`}
                    </button>
                  ))}
                </div>
                <div className="w-40">
                  <Label htmlFor="event-search" className="sr-only">
                    {c("Search events")}
                  </Label>
                  <input
                    id="event-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={c("Search events…")}
                    className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>

              <p className="text-xs" data-testid="run-summary" aria-live="polite">
                {result?.valid ? (
                  <>
                    <span className="font-semibold tabular-nums" data-testid="matched-count">
                      {matchedCount}
                    </span>{" "}
                    {c("of")} {result.item_count}{" "}
                    {items[0]?.kind === "file" ? c("files") : c("events")} {c("matched")}
                    {result.correlation
                      ? ` · ${countLabel(c, result.correlation.hits.length, "{{count}} correlation hit", "{{count}} correlation hits")}`
                      : ""}
                  </>
                ) : result ? (
                  <span className="text-sev-critical">
                    {c("The rule is not valid, so nothing was evaluated.")}
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    {detail.isLoading
                      ? c("Loading dataset…")
                      : c("Run the rule to see which items match.")}
                  </span>
                )}
              </p>

              <div
                className="max-h-[34rem] overflow-auto rounded-lg border border-border"
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    moveSelection(1);
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    moveSelection(-1);
                  }
                }}
              >
                <table className="w-full text-xs" data-testid="event-table">
                  <caption className="sr-only">
                    {c("Events in the selected dataset. Use the arrow keys to move between rows.")}
                  </caption>
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="w-16 px-2 py-1.5">
                        {c("Time")}
                      </th>
                      <th scope="col" className="px-2 py-1.5">
                        {items[0]?.kind === "file" ? c("File") : c("Host")}
                      </th>
                      <th scope="col" className="px-2 py-1.5">
                        {c("Event")}
                      </th>
                      <th scope="col" className="w-24 px-2 py-1.5">
                        {c("Result")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((it) => {
                      const v = verdicts.get(it.index);
                      const active = it.index === selected;
                      return (
                        <tr
                          key={it.index}
                          data-testid="event-row"
                          data-verdict={v?.verdict ?? "none"}
                          data-selected={active}
                          className={cn(
                            "border-b border-border/60 last:border-0",
                            active && "bg-primary/10",
                            v?.verdict === "matched" && !active && "bg-ok/5",
                          )}
                        >
                          <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                            {it.kind === "file" ? "" : formatOffset(it.offset_seconds)}
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 font-mono text-[11px]">
                            {it.kind === "file" ? "" : (it.host ?? "-")}
                          </td>
                          <td className="max-w-0 px-2 py-1.5">
                            <button
                              type="button"
                              ref={(el) => {
                                if (el) rowRefs.current.set(it.index, el);
                                else rowRefs.current.delete(it.index);
                              }}
                              onClick={() => setSelected(it.index)}
                              aria-pressed={active}
                              aria-label={`${it.kind === "file" ? c("File") : c("Event")} ${it.index + 1}: ${it.title}`}
                              className="block w-full truncate rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {it.kind === "file" ? it.title : it.title}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5">
                            {v ? (
                              verdictBadge(v.verdict)
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {visible.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-6 text-center text-muted-foreground">
                          {items.length ? c("Nothing matches this filter.") : c("No data yet.")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </section>

      {/* RIGHT: explanation */}
      <section aria-label={c("Match explanation")} className="min-w-0">
        <Card className="p-4">
          <Tabs value={rightTab} onValueChange={setRightTab}>
            <TabsList>
              <TabsTrigger value="trace" data-testid="tab-trace">
                {c("Match Trace")}
              </TabsTrigger>
              <TabsTrigger value="translations" data-testid="tab-translations">
                {c("Translations")}
              </TabsTrigger>
              <TabsTrigger value="mitre" data-testid="tab-mitre">
                MITRE
              </TabsTrigger>
            </TabsList>

            <TabsContent value="trace" className="space-y-3">
              {selectedItem ? (
                <div
                  className="rounded-lg border border-border bg-muted/30 p-2.5"
                  data-testid="selected-event"
                >
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {selectedItem.kind === "file" ? c("Sample") : c("Raw event")}{" "}
                    {selectedItem.index + 1}
                    {selectedItem.host ? ` · ${selectedItem.host}` : ""}
                    {selectedItem.user ? ` · ${selectedItem.user}` : ""}
                  </p>
                  <div
                    role="region"
                    aria-label={c("Raw event text")}
                    tabIndex={0}
                    className="max-h-28 overflow-auto break-all rounded-sm font-mono text-[11px] leading-snug outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Highlighted
                      text={selectedItem.raw.slice(0, 1500)}
                      needles={explainMatchedValues}
                    />
                  </div>
                  {selectedItem.note ? (
                    <p className="mt-1.5 text-[11px] italic text-muted-foreground">
                      {selectedItem.note}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {explain.isFetching && !explain.data ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {c("Tracing…")}
                </p>
              ) : explain.data && selected !== null ? (
                <TraceView data={explain.data} />
              ) : explain.isError ? (
                <p className="text-xs text-sev-critical">{(explain.error as Error).message}</p>
              ) : (
                <EmptyState
                  icon={<FlaskConical />}
                  title={c("Explain a match")}
                  description={c(
                    "Run the rule, then pick an event to see which selections matched, which field and value decided it, and how the condition resolved.",
                  )}
                  className="py-10"
                />
              )}
            </TabsContent>

            <TabsContent value="translations">
              {lastRun?.body.format !== "sigma" ? (
                <EmptyState
                  icon={<Languages />}
                  title={c("Sigma only")}
                  description={c("Translations are generated from Sigma rules.")}
                  className="py-10"
                />
              ) : translations.data ? (
                <TranslationView result={translations.data} />
              ) : translations.isFetching ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {c("Translating…")}
                </p>
              ) : (
                <EmptyState
                  icon={<Languages />}
                  title={c("Translate to your SIEM")}
                  description={c(
                    "Run a valid Sigma rule to get Elastic, Splunk, Sentinel, OpenSearch and SQL-like queries.",
                  )}
                  className="py-10"
                />
              )}
            </TabsContent>

            <TabsContent value="mitre">
              <div className="space-y-3 text-[13px]" data-testid="mitre-panel">
                <div>
                  <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {c("This rule maps to")}
                  </h3>
                  {result?.mitre?.length ? (
                    <ul className="mt-1.5 space-y-1.5">
                      {result.mitre.map((m) => (
                        <li key={m.id}>
                          <Link
                            href={m.known ? `/mitre/${m.id}` : "#"}
                            className="inline-flex items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Badge variant={m.known ? "outline" : "warning"} className="font-mono">
                              {m.id}
                            </Badge>
                            <span className="text-xs">
                              {m.name ?? c("not in the curated dataset")}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {result
                        ? c("No ATT&CK tags on this rule.")
                        : c("Run the rule to see its ATT&CK mapping.")}
                    </p>
                  )}
                </div>
                {dataset ? (
                  <div>
                    <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {c("This dataset exercises")}
                    </h3>
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {dataset.mitre.map((m) => (
                        <li key={m.id}>
                          <Link
                            href={`/mitre/${m.id}`}
                            className="inline-flex items-center gap-1.5 rounded-md focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Badge variant="outline" className="font-mono">
                              {m.id}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{m.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </Card>
      </section>
    </div>
  );
}
