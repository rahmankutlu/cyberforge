"use client";

import type {
  RuleDetail,
  RuleFormat,
  TestResponse,
  TranslateResponse,
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
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Languages,
  Save,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  TranslationView,
  translateBody,
  type PipelineSelection,
} from "@/components/detections/translation-view";
import { apiGet, apiSend } from "@/lib/api";
import { useLocale } from "@/components/i18n/locale-provider";
import { countLabel } from "@/lib/i18n/copy";

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

export interface WorkbenchProps {
  mode: "playground" | "create";
  initialContent: string;
  presets: { slug: string; title: string; format: RuleFormat }[];
  labs: { slug: string; title: string; number: number }[];
}

function ValidationView({ result }: { result: ValidateResponse }) {
  const { c } = useLocale();
  const meta = result.meta;
  return (
    <div className="space-y-4" data-testid="validation-result">
      <div className="flex flex-wrap items-center gap-2">
        {result.valid ? (
          <Badge variant="success" data-testid="valid-badge">
            <CheckCircle2 className="size-3" /> {c("Valid")} {result.format}{" "}
            {c("Rule").toLocaleLowerCase()}
          </Badge>
        ) : (
          <Badge variant="critical" data-testid="invalid-badge">
            <XCircle className="size-3" /> {c("Invalid")}
          </Badge>
        )}
        {meta ? <span className="text-sm font-medium">{meta.title}</span> : null}
      </div>

      {result.errors.length ? (
        <ul className="space-y-1.5" aria-label={c("Errors")}>
          {result.errors.map((e, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-md border border-sev-critical/30 bg-sev-critical/8 p-2.5 text-xs"
            >
              <XCircle className="mt-0.5 size-3.5 shrink-0 text-sev-critical" />
              <span className="break-words">{e}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {result.warnings.length ? (
        <ul className="space-y-1.5" aria-label={c("Warnings")}>
          {result.warnings.map((w, i) => (
            <li
              key={i}
              className="flex gap-2 rounded-md border border-sev-medium/30 bg-sev-medium/8 p-2.5 text-xs"
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-sev-medium" />
              <span className="break-words">{w}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {meta ? (
        <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {c("Level / status")}
            </dt>
            <dd>
              {meta.level} · {meta.status ?? "unspecified"}
              {meta.is_correlation ? " · correlation" : ""}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {c("Logsource")}
            </dt>
            <dd className="font-mono text-xs">
              {Object.entries(meta.logsource)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ") || "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {c("Fields detected")}
            </dt>
            <dd className="mt-1 flex flex-wrap gap-1.5" data-testid="fields-detected">
              {meta.fields.length
                ? meta.fields.map((f) => (
                    <Badge key={f} variant="outline" className="font-mono">
                      {f}
                    </Badge>
                  ))
                : "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {c("MITRE mappings")}
            </dt>
            <dd className="mt-1 flex flex-wrap gap-2" data-testid="mitre-mappings">
              {result.mitre.length ? (
                result.mitre.map((m) => (
                  <Link
                    key={m.id}
                    href={m.known ? `/mitre/${m.id}` : "#"}
                    className="inline-flex items-center gap-1.5"
                  >
                    <Badge variant={m.known ? "outline" : "warning"} className="font-mono">
                      {m.id}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {m.name ?? "not in the curated dataset"}
                    </span>
                  </Link>
                ))
              ) : (
                <span className="text-muted-foreground">{c("No ATT&CK tags")}</span>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {c("Potential false positives")}
            </dt>
            <dd className="mt-1">
              {meta.falsepositives.length ? (
                <ul className="list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {meta.falsepositives.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground">
                  {c("None documented. Add falsepositives to help analysts.")}
                </span>
              )}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}

function TestView({ result }: { result: TestResponse }) {
  const { c } = useLocale();
  if (!result.valid) {
    return (
      <ul className="space-y-1.5">
        {result.errors.map((e) => (
          <li
            key={e}
            className="rounded-md border border-sev-critical/30 bg-sev-critical/8 p-2.5 text-xs"
          >
            {e}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-3" data-testid="test-result">
      <p className="text-[13px]">
        {c("{{matched}} of {{total}} events matched", {
          matched: result.matched_count,
          total: result.event_count,
        })}
        {result.correlation.length
          ? ` · ${countLabel(c, result.correlation.length, "{{count}} correlation hit", "{{count}} correlation hits")}`
          : ""}
      </p>
      {result.correlation.map((hit, i) => (
        <div key={i} className="rounded-md border border-primary/30 bg-primary/8 p-2.5 text-xs">
          <p className="font-medium">
            {c("Correlation matched {{count}} events", { count: hit.event_indexes.length })}
          </p>
          <p className="mt-1 font-mono text-muted-foreground">
            {JSON.stringify({ ...hit.details, group: hit.group })}
          </p>
        </div>
      ))}
      <ul className="max-h-96 space-y-1.5 overflow-y-auto">
        {result.matches.slice(0, 60).map((m) => (
          <li
            key={m.index}
            className={cn(
              "rounded-md border p-2 text-xs",
              m.matched ? "border-ok/30 bg-ok/8" : "border-border",
            )}
          >
            <p className="flex items-center gap-1.5">
              {m.matched ? (
                <CheckCircle2 className="size-3.5 text-ok" />
              ) : (
                <XCircle className="size-3.5 text-muted-foreground" />
              )}
              <span className="font-mono">event {m.index + 1}</span>
              <span className="text-muted-foreground">· {m.summary}</span>
            </p>
            {m.trace.map((t, i) => (
              <p
                key={i}
                className="mt-1 break-all pl-5 font-mono text-[11px] text-muted-foreground"
              >
                {t.field} ~ <span className="text-primary">{t.pattern}</span>
              </p>
            ))}
          </li>
        ))}
      </ul>
      {result.matches.length > 60 ? (
        <p className="text-[11px] text-muted-foreground">
          {c("Showing the first 60 of {{count}} events.", { count: result.matches.length })}
        </p>
      ) : null}
    </div>
  );
}

export function SigmaWorkbench({ mode, initialContent, presets, labs }: WorkbenchProps) {
  const { c } = useLocale();
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [format, setFormat] = useState<RuleFormat>("sigma");
  const [tab, setTab] = useState("validate");
  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [translation, setTranslation] = useState<TranslateResponse | null>(null);
  const [pipelines, setPipelines] = useState<PipelineSelection>({});
  const [testResult, setTestResult] = useState<TestResponse | null>(null);
  const [source, setSource] = useState<"lab" | "custom">("custom");
  const [labSlug, setLabSlug] = useState(labs[0]?.slug ?? "");
  const [events, setEvents] = useState(SAMPLE_EVENTS);

  const reset = () => {
    setValidation(null);
    setTranslation(null);
    setTestResult(null);
  };

  const fail = (title: string) => (error: Error) =>
    toast.error(title, { description: error.message });

  const validate = useMutation({
    mutationFn: () =>
      apiSend<ValidateResponse>("POST", "/detections/validate", { content, format }),
    onSuccess: (data) => {
      setValidation(data);
      setTab("validate");
    },
    onError: fail("Validation request failed"),
  });

  const translate = useMutation({
    mutationFn: (selection: PipelineSelection) =>
      apiSend<TranslateResponse>(
        "POST",
        "/detections/translate",
        translateBody(content, selection),
      ),
    onSuccess: (data) => {
      setTranslation(data);
      setValidation(data.validation);
      setTab("translate");
    },
    onError: fail("Translation request failed"),
  });

  const test = useMutation({
    mutationFn: () => {
      if (source === "lab")
        return apiSend<TestResponse>("POST", "/detections/test", { content, lab_slug: labSlug });
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
      toast.success(c("Rule saved"), { description: rule.title });
      router.push(`/detections/${rule.slug}`);
    },
    onError: fail(c("Could not save the rule")),
  });

  const busy = validate.isPending || translate.isPending || test.isPending;
  const tooLarge = new Blob([content]).size > 64 * 1024;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <Label htmlFor="preset">{c("Load an existing rule")}</Label>
            <NativeSelect
              id="preset"
              value=""
              onChange={(e) => e.target.value && load.mutate(e.target.value)}
              className="mt-1"
            >
              <option value="">{c("Choose a rule…")}</option>
              {presets.map((p) => (
                <option key={p.slug} value={p.slug}>{`[${p.format}] ${p.title}`}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="w-32">
            <Label htmlFor="format">{c("Format")}</Label>
            <NativeSelect
              id="format"
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as RuleFormat);
                reset();
              }}
              className="mt-1"
              disabled={mode === "create"}
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
          onChange={(e) => {
            setContent(e.target.value);
          }}
          spellCheck={false}
          className="min-h-[28rem] resize-y font-mono text-xs leading-5"
          maxLength={70000}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p
            className={cn("text-[11px]", tooLarge ? "text-sev-critical" : "text-muted-foreground")}
          >
            {c("{{count}} characters · 64 KiB limit · nothing leaves this instance", {
              count: content.length.toLocaleString(),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => validate.mutate()}
              disabled={busy || !content.trim()}
              data-testid="validate-rule"
            >
              <ShieldCheck /> {c("Validate")}
            </Button>
            <Button
              variant="outline"
              onClick={() => translate.mutate(pipelines)}
              disabled={busy || !content.trim() || format !== "sigma"}
              data-testid="translate-rule"
            >
              <Languages /> {c("Translate")}
            </Button>
            {mode === "create" ? (
              <Button
                onClick={() => save.mutate()}
                disabled={save.isPending || !content.trim() || tooLarge}
                data-testid="save-rule"
              >
                <Save /> {c("Save rule")}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <Card className="min-w-0 p-4">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="validate">{c("Validation")}</TabsTrigger>
            <TabsTrigger value="translate">{c("Translation")}</TabsTrigger>
            <TabsTrigger value="test">{c("Test against events")}</TabsTrigger>
          </TabsList>

          <TabsContent value="validate">
            {validation ? (
              <ValidationView result={validation} />
            ) : (
              <EmptyState
                icon={<ShieldCheck />}
                title={c("Validate your rule")}
                description={c(
                  "Checks syntax, conditions and modifiers with pySigma, lists the fields the rule reads, and verifies the MITRE identifiers.",
                )}
                className="py-10"
              />
            )}
          </TabsContent>

          <TabsContent value="translate">
            {translation ? (
              <TranslationView
                result={translation}
                selection={pipelines}
                onSelect={(target, id) => {
                  const next = { ...pipelines, [target]: id };
                  setPipelines(next);
                  translate.mutate(next);
                }}
              />
            ) : (
              <EmptyState
                icon={<Languages />}
                title={c("Translate to your SIEM")}
                description={c(
                  "Elastic (Lucene), Splunk SPL, Microsoft Sentinel KQL, OpenSearch and a generic SQL-like form, powered by pySigma.",
                )}
                className="py-10"
              />
            )}
          </TabsContent>

          <TabsContent value="test">
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-48">
                  <Label htmlFor="test-source">{c("Events from")}</Label>
                  <NativeSelect
                    id="test-source"
                    value={source}
                    onChange={(e) => setSource(e.target.value as "lab" | "custom")}
                    className="mt-1"
                  >
                    <option value="custom">{c("Custom JSON events")}</option>
                    <option value="lab">{c("A lab scenario")}</option>
                  </NativeSelect>
                </div>
                {source === "lab" ? (
                  <div className="min-w-48 flex-1">
                    <Label htmlFor="test-lab">{c("Labs")}</Label>
                    <NativeSelect
                      id="test-lab"
                      value={labSlug}
                      onChange={(e) => setLabSlug(e.target.value)}
                      className="mt-1"
                    >
                      {labs.map((l) => (
                        <option
                          key={l.slug}
                          value={l.slug}
                        >{`${String(l.number).padStart(2, "0")} ${l.title}`}</option>
                      ))}
                    </NativeSelect>
                  </div>
                ) : null}
                <Button
                  onClick={() => test.mutate()}
                  disabled={busy || format !== "sigma" || !content.trim()}
                  data-testid="test-rule"
                >
                  <FlaskConical /> {test.isPending ? c("Testing…") : c("Run test")}
                </Button>
              </div>
              {source === "custom" ? (
                <div>
                  <Label htmlFor="test-events">
                    {c("Events (JSON array of objects)")} {"{category, fields}"}
                  </Label>
                  <Textarea
                    id="test-events"
                    value={events}
                    onChange={(e) => setEvents(e.target.value)}
                    spellCheck={false}
                    rows={10}
                    className="mt-1 font-mono text-xs"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {c(
                      "Field names follow the Sigma vocabulary (Image, CommandLine, c-ip…). The category picks the logsource, so a rule only sees compatible events.",
                    )}
                  </p>
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
