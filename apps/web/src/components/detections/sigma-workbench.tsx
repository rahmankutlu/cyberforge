"use client";

import type {
  RuleDetail,
  RuleFormat,
  TestResponse,
  TranslateResponse,
  TranslateTarget,
  ValidateResponse,
} from "@cyberforge/types";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Label,
  NativeSelect,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
} from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FlaskConical, Languages, Save, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { CodeBlock } from "@/components/code-block";
import { apiGet, apiSend } from "@/lib/api";

const SAMPLE_EVENTS = `[
  {
    "category": "process_creation",
    "fields": {
      "Image": "C:\\\\Windows\\\\System32\\\\powershell.exe",
      "CommandLine": "powershell.exe -nop -enc SQBFAFgA",
      "ParentImage": "C:\\\\Windows\\\\System32\\\\cmd.exe"
    }
  },
  {
    "category": "process_creation",
    "fields": {
      "Image": "C:\\\\Windows\\\\System32\\\\cmd.exe",
      "CommandLine": "cmd.exe /c dir",
      "ParentImage": "C:\\\\Windows\\\\explorer.exe"
    }
  }
]`;

const TARGETS: { id: TranslateTarget; label: string }[] = [
  { id: "elastic", label: "Elastic" },
  { id: "splunk", label: "Splunk SPL" },
  { id: "sentinel", label: "Sentinel / KQL" },
  { id: "opensearch", label: "OpenSearch" },
  { id: "sql", label: "SQL-like" },
];

export interface WorkbenchProps {
  mode: "playground" | "create";
  initialContent: string;
  presets: { slug: string; title: string; format: RuleFormat }[];
  labs: { slug: string; title: string; number: number }[];
}

function ValidationView({ result }: { result: ValidateResponse }) {
  const meta = result.meta;
  return (
    <div className="space-y-4" data-testid="validation-result">
      <div className="flex flex-wrap items-center gap-2">
        {result.valid ? (
          <Badge variant="success" data-testid="valid-badge"><CheckCircle2 className="size-3" /> Valid {result.format} rule</Badge>
        ) : (
          <Badge variant="critical" data-testid="invalid-badge"><XCircle className="size-3" /> Invalid</Badge>
        )}
        {meta ? <span className="text-sm font-medium">{meta.title}</span> : null}
      </div>

      {result.errors.length ? (
        <ul className="space-y-1.5" aria-label="Errors">
          {result.errors.map((e, i) => (
            <li key={i} className="flex gap-2 rounded-md border border-sev-critical/30 bg-sev-critical/8 p-2.5 text-xs">
              <XCircle className="mt-0.5 size-3.5 shrink-0 text-sev-critical" />
              <span className="break-words">{e}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {result.warnings.length ? (
        <ul className="space-y-1.5" aria-label="Warnings">
          {result.warnings.map((w, i) => (
            <li key={i} className="flex gap-2 rounded-md border border-sev-medium/30 bg-sev-medium/8 p-2.5 text-xs">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-sev-medium" />
              <span className="break-words">{w}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {meta ? (
        <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Level / status</dt>
            <dd>{meta.level} · {meta.status ?? "unspecified"}{meta.is_correlation ? " · correlation" : ""}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Logsource</dt>
            <dd className="font-mono text-xs">{Object.entries(meta.logsource).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Fields detected</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5" data-testid="fields-detected">
              {meta.fields.length ? meta.fields.map((f) => <Badge key={f} variant="outline" className="font-mono">{f}</Badge>) : "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">MITRE mappings</dt>
            <dd className="mt-1 flex flex-wrap gap-2" data-testid="mitre-mappings">
              {result.mitre.length ? (
                result.mitre.map((m) => (
                  <Link key={m.id} href={m.known ? `/mitre/${m.id}` : "#"} className="inline-flex items-center gap-1.5">
                    <Badge variant={m.known ? "outline" : "warning"} className="font-mono">{m.id}</Badge>
                    <span className="text-xs text-muted-foreground">{m.name ?? "not in the curated dataset"}</span>
                  </Link>
                ))
              ) : (
                <span className="text-muted-foreground">No ATT&amp;CK tags</span>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">Potential false positives</dt>
            <dd className="mt-1">
              {meta.falsepositives.length ? (
                <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {meta.falsepositives.map((f) => <li key={f}>{f}</li>)}
                </ul>
              ) : (
                <span className="text-muted-foreground">None documented. Add falsepositives to help analysts.</span>
              )}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function TranslationView({ result }: { result: TranslateResponse }) {
  if (!result.validation.valid) {
    return <EmptyState icon={<XCircle />} title="Fix the validation errors first" description="A rule must be valid before it can be translated." className="py-8" />;
  }
  return (
    <Tabs defaultValue={result.translations[0]?.target ?? "elastic"}>
      <TabsList className="h-auto flex-wrap justify-start">
        {result.translations.map((t) => (
          <TabsTrigger key={t.target} value={t.target} data-testid={`target-${t.target}`}>{TARGETS.find((x) => x.id === t.target)?.label ?? t.label}</TabsTrigger>
        ))}
      </TabsList>
      {result.translations.map((t) => (
        <TabsContent key={t.target} value={t.target}>
          <p className="mb-2 text-xs text-muted-foreground">{t.label} · {t.language}</p>
          {t.error ? (
            <div className="rounded-md border border-sev-medium/30 bg-sev-medium/8 p-3 text-xs">
              <p className="font-medium">Not supported by this backend</p>
              <p className="mt-1 break-words text-muted-foreground">{t.error}</p>
            </div>
          ) : (
            <div className="space-y-2" data-testid={`translation-${t.target}`}>
              {t.queries.map((q, i) => (
                <CodeBlock key={i} code={q} title={t.language} maxHeight="16rem" wrap />
              ))}
            </div>
          )}
          {t.notes.map((n) => (
            <p key={n} className="mt-2 text-[11px] leading-snug text-muted-foreground">{n}</p>
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}

function TestView({ result }: { result: TestResponse }) {
  if (!result.valid) {
    return (
      <ul className="space-y-1.5">
        {result.errors.map((e) => (
          <li key={e} className="rounded-md border border-sev-critical/30 bg-sev-critical/8 p-2.5 text-xs">{e}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-3" data-testid="test-result">
      <p className="text-[13px]">
        <span className="font-semibold tabular-nums" data-testid="matched-count">{result.matched_count}</span> of {result.event_count} events matched
        {result.correlation.length ? ` · ${result.correlation.length} correlation hit${result.correlation.length === 1 ? "" : "s"}` : ""}
      </p>
      {result.correlation.map((c, i) => (
        <div key={i} className="rounded-md border border-primary/30 bg-primary/8 p-2.5 text-xs">
          <p className="font-medium">Correlation matched {c.event_indexes.length} events</p>
          <p className="mt-1 font-mono text-muted-foreground">{JSON.stringify({ ...c.details, group: c.group })}</p>
        </div>
      ))}
      <ul className="max-h-96 space-y-1.5 overflow-y-auto">
        {result.matches.slice(0, 60).map((m) => (
          <li key={m.index} className={cn("rounded-md border p-2 text-xs", m.matched ? "border-ok/30 bg-ok/8" : "border-border")}>
            <p className="flex items-center gap-1.5">
              {m.matched ? <CheckCircle2 className="size-3.5 text-ok" /> : <XCircle className="size-3.5 text-muted-foreground" />}
              <span className="font-mono">event {m.index + 1}</span>
              <span className="text-muted-foreground">· {m.summary}</span>
            </p>
            {m.trace.map((t, i) => (
              <p key={i} className="mt-1 break-all pl-5 font-mono text-[11px] text-muted-foreground">
                {t.field} ~ <span className="text-primary">{t.pattern}</span>
              </p>
            ))}
          </li>
        ))}
      </ul>
      {result.matches.length > 60 ? <p className="text-[11px] text-muted-foreground">Showing the first 60 of {result.matches.length} events.</p> : null}
    </div>
  );
}

export function SigmaWorkbench({ mode, initialContent, presets, labs }: WorkbenchProps) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [format, setFormat] = useState<RuleFormat>("sigma");
  const [tab, setTab] = useState("validate");
  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [translation, setTranslation] = useState<TranslateResponse | null>(null);
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [source, setSource] = useState<"lab" | "custom">("custom");
  const [labSlug, setLabSlug] = useState(labs[0]?.slug ?? "");
  const [events, setEvents] = useState(SAMPLE_EVENTS);

  const reset = () => {
    setValidation(null);
    setTranslation(null);
    setTestResult(null);
  };

  const fail = (title: string) => (error: Error) => toast.error(title, { description: error.message });

  const validate = useMutation({
    mutationFn: () => apiSend<ValidateResponse>("POST", "/detections/validate", { content, format }),
    onSuccess: (data) => {
      setValidation(data);
      setTab("validate");
    },
    onError: fail("Validation request failed"),
  });

  const translate = useMutation({
    mutationFn: () => apiSend<TranslateResponse>("POST", "/detections/translate", { content }),
    onSuccess: (data) => {
      setTranslation(data);
      setValidation(data.validation);
      setTab("translate");
    },
    onError: fail("Translation request failed"),
  });

  const test = useMutation({
    mutationFn: () => {
      if (source === "lab") return apiSend<TestResponse>("POST", "/detections/test", { content, lab_slug: labSlug });
      let parsed: unknown;
      try {
        parsed = JSON.parse(events);
      } catch {
        throw new Error("Events must be valid JSON: an array of {category, fields} objects.");
      }
      if (!Array.isArray(parsed)) throw new Error("Events must be a JSON array.");
      return apiSend<TestResponse>("POST", "/detections/test", { content, events: parsed });
    },
    onSuccess: (data) => {
      setTestResult(data);
      setTab("test");
    },
    onError: fail("Test failed"),
  });

  const load = useMutation({
    mutationFn: (slug: string) => apiGet<RuleDetail>(`/detections/${slug}`),
    onSuccess: (rule) => {
      setContent(rule.content);
      setFormat(rule.format);
      reset();
      toast.message(`Loaded ${rule.title}`);
    },
    onError: fail("Could not load the rule"),
  });

  const save = useMutation({
    mutationFn: () => apiSend<RuleDetail>("POST", "/detections", { content, format: "sigma" }),
    onSuccess: (rule) => {
      toast.success("Rule saved", { description: rule.title });
      router.push(`/detections/${rule.slug}`);
    },
    onError: fail("Could not save the rule"),
  });

  const busy = validate.isPending || translate.isPending || test.isPending;
  const tooLarge = new Blob([content]).size > 64 * 1024;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Label htmlFor="preset">Load an existing rule</Label>
            <NativeSelect id="preset" value="" onChange={(e) => e.target.value && load.mutate(e.target.value)} className="mt-1">
              <option value="">Choose a rule…</option>
              {presets.map((p) => (
                <option key={p.slug} value={p.slug}>{`[${p.format}] ${p.title}`}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="w-32">
            <Label htmlFor="format">Format</Label>
            <NativeSelect id="format" value={format} onChange={(e) => { setFormat(e.target.value as RuleFormat); reset(); }} className="mt-1" disabled={mode === "create"}>
              <option value="sigma">Sigma</option>
              <option value="yara">YARA</option>
              <option value="suricata">Suricata</option>
            </NativeSelect>
          </div>
        </div>

        <Textarea
          aria-label="Rule source"
          data-testid="rule-editor"
          value={content}
          onChange={(e) => { setContent(e.target.value); }}
          spellCheck={false}
          className="min-h-[28rem] resize-y font-mono text-xs leading-5"
          maxLength={70000}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn("text-[11px]", tooLarge ? "text-sev-critical" : "text-muted-foreground")}>{content.length.toLocaleString()} characters · 64 KiB limit · nothing leaves this instance</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => validate.mutate()} disabled={busy || !content.trim()} data-testid="validate-rule">
              <ShieldCheck /> Validate
            </Button>
            <Button variant="outline" onClick={() => translate.mutate()} disabled={busy || !content.trim() || format !== "sigma"} data-testid="translate-rule">
              <Languages /> Translate
            </Button>
            {mode === "create" ? (
              <Button onClick={() => save.mutate()} disabled={save.isPending || !content.trim() || tooLarge} data-testid="save-rule">
                <Save /> Save rule
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Card className="min-w-0 p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="validate">Validation</TabsTrigger>
            <TabsTrigger value="translate">Translation</TabsTrigger>
            <TabsTrigger value="test">Test against events</TabsTrigger>
          </TabsList>

          <TabsContent value="validate">
            {validation ? (
              <ValidationView result={validation} />
            ) : (
              <EmptyState icon={<ShieldCheck />} title="Validate your rule" description="Checks syntax, conditions and modifiers with pySigma, lists the fields the rule reads, and verifies the MITRE identifiers." className="py-10" />
            )}
          </TabsContent>

          <TabsContent value="translate">
            {translation ? (
              <TranslationView result={translation} />
            ) : (
              <EmptyState icon={<Languages />} title="Translate to your SIEM" description="Elastic (Lucene), Splunk SPL, Microsoft Sentinel KQL, OpenSearch and a generic SQL-like form, powered by pySigma." className="py-10" />
            )}
          </TabsContent>

          <TabsContent value="test">
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-48">
                  <Label htmlFor="test-source">Events from</Label>
                  <NativeSelect id="test-source" value={source} onChange={(e) => setSource(e.target.value as "lab" | "custom")} className="mt-1">
                    <option value="custom">Custom JSON events</option>
                    <option value="lab">A lab scenario</option>
                  </NativeSelect>
                </div>
                {source === "lab" ? (
                  <div className="min-w-48 flex-1">
                    <Label htmlFor="test-lab">Lab</Label>
                    <NativeSelect id="test-lab" value={labSlug} onChange={(e) => setLabSlug(e.target.value)} className="mt-1">
                      {labs.map((l) => (
                        <option key={l.slug} value={l.slug}>{`${String(l.number).padStart(2, "0")} ${l.title}`}</option>
                      ))}
                    </NativeSelect>
                  </div>
                ) : null}
                <Button onClick={() => test.mutate()} disabled={busy || format !== "sigma" || !content.trim()} data-testid="test-rule">
                  <FlaskConical /> {test.isPending ? "Testing…" : "Run test"}
                </Button>
              </div>
              {source === "custom" ? (
                <div>
                  <Label htmlFor="test-events">Events (JSON array of {"{category, fields}"})</Label>
                  <Textarea id="test-events" value={events} onChange={(e) => setEvents(e.target.value)} spellCheck={false} rows={10} className="mt-1 font-mono text-xs" />
                  <p className="mt-1 text-[11px] text-muted-foreground">Field names follow the Sigma vocabulary (Image, CommandLine, c-ip…). The category picks the logsource, so a rule only sees compatible events.</p>
                </div>
              ) : null}
              {testResult ? <TestView result={testResult} /> : null}
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
