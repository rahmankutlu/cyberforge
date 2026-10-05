"use client";

import type {
  TranslateResponse,
  TranslateTarget,
  Translation,
  TranslationPipelines,
} from "@cyberforge/types";
import {
  Badge,
  EmptyState,
  Label,
  NativeSelect,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@cyberforge/ui";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, XCircle } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import { useLocale } from "@/components/i18n/locale-provider";
import { apiGet } from "@/lib/api";
import { localizeTranslationNote } from "@/lib/translation-notes";

export const TARGETS: { id: TranslateTarget; label: string }[] = [
  { id: "elastic", label: "Elastic" },
  { id: "splunk", label: "Splunk SPL" },
  { id: "sentinel", label: "Sentinel / KQL" },
  { id: "opensearch", label: "OpenSearch" },
  { id: "sql", label: "SQL-like" },
];

const AUTO = "auto";
const NONE = "none";

/** The pipeline a person picked per target. A target without an entry uses `auto`. */
export type PipelineSelection = Partial<Record<TranslateTarget, string>>;

/** Request body for `POST /detections/translate`: map fields to each SIEM's schema by default. */
export function translateBody(content: string, selection: PipelineSelection) {
  const pipelines: Record<string, string> = {
    elastic: AUTO,
    splunk: AUTO,
    sentinel: AUTO,
    opensearch: AUTO,
    ...selection,
  };
  return { content, pipelines };
}

function PipelinePicker({
  translation,
  value,
  options,
  onChange,
}: {
  translation: Translation;
  value: string;
  options: TranslationPipelines | undefined;
  onChange: (id: string) => void;
}) {
  const { c } = useLocale();
  const choices = options?.[translation.target] ?? [];
  if (choices.length === 0) return null;
  const id = `pipeline-${translation.target}`;
  return (
    <div className="mb-3 max-w-xs">
      <Label htmlFor={id}>{c("Field mapping pipeline")}</Label>
      <NativeSelect
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-testid={`pipeline-${translation.target}`}
      >
        <option value={AUTO}>{c("Auto (best fit)")}</option>
        <option value={NONE}>{c("None (field names unchanged)")}</option>
        {choices.map((pipeline) => (
          <option key={pipeline.id} value={pipeline.id}>
            {pipeline.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

function FieldMapping({ translation }: { translation: Translation }) {
  const { c } = useLocale();
  const { field_changes: changes, added_fields: added, dropped_fields: dropped } = translation;
  if (changes.length === 0 && added.length === 0 && dropped.length === 0) return null;
  return (
    <section
      className="mt-3 rounded-md border border-border"
      aria-label={c("Field mapping")}
      data-testid={`field-mapping-${translation.target}`}
    >
      <table className="w-full text-xs">
        <caption className="sr-only">{c("Field mapping")}</caption>
        <thead className="bg-muted/40 text-left text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-1.5 font-medium">
              {c("Rule field")}
            </th>
            <th scope="col" className="px-3 py-1.5 font-medium">
              {c("Maps to")}
            </th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.source} className="border-t border-border/60">
              <th scope="row" className="px-3 py-1.5 text-left font-mono font-normal">
                {change.source}
              </th>
              <td className="px-3 py-1.5 font-mono">
                {change.changed ? (
                  change.targets.join(", ")
                ) : (
                  <span className="text-muted-foreground">{c("unchanged")}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {added.length ? (
        <p className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          {c("Added by the pipeline: {{fields}}", { fields: added.join(", ") })}
        </p>
      ) : null}
      {dropped.length ? (
        <p className="border-t border-border/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          {c("Not carried over by the pipeline: {{fields}}", { fields: dropped.join(", ") })}
        </p>
      ) : null}
    </section>
  );
}

export function TranslationView({
  result,
  selection = {},
  onSelect,
}: {
  result: TranslateResponse;
  selection?: PipelineSelection;
  onSelect?: (target: TranslateTarget, pipeline: string) => void;
}) {
  const { c } = useLocale();
  const catalogue = useQuery({
    queryKey: ["translate-pipelines"],
    queryFn: () => apiGet<TranslationPipelines>("/detections/translate/pipelines"),
    staleTime: Infinity,
    enabled: onSelect !== undefined,
  });

  if (!result.validation.valid) {
    return (
      <EmptyState
        icon={<XCircle />}
        title={c("Fix the validation errors first")}
        description={c("A rule must be valid before it can be translated.")}
        className="py-8"
      />
    );
  }
  return (
    <Tabs defaultValue={result.translations[0]?.target ?? "elastic"}>
      <TabsList className="h-auto flex-wrap justify-start">
        {result.translations.map((t) => (
          <TabsTrigger key={t.target} value={t.target} data-testid={`target-${t.target}`}>
            {TARGETS.find((x) => x.id === t.target)?.label ?? t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {result.translations.map((t) => (
        <TabsContent key={t.target} value={t.target}>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {t.label} · {t.language}
            </span>
            {t.target === "sql" ? null : t.pipeline_label ? (
              <Badge variant="accent" data-testid={`pipeline-badge-${t.target}`}>
                {c("Mapped with {{pipeline}}", { pipeline: t.pipeline_label })}
              </Badge>
            ) : (
              <Badge variant="outline" data-testid={`pipeline-badge-${t.target}`}>
                {c("Field names unchanged")}
              </Badge>
            )}
          </div>
          {onSelect ? (
            <PipelinePicker
              translation={t}
              value={selection[t.target] ?? AUTO}
              options={catalogue.data}
              onChange={(id) => onSelect(t.target, id)}
            />
          ) : null}
          {t.pipeline_error ? (
            <div
              className="mb-3 flex gap-2 rounded-md border border-sev-medium/30 bg-sev-medium/8 p-3 text-xs"
              role="note"
              data-testid={`pipeline-error-${t.target}`}
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-sev-medium" aria-hidden />
              <div>
                <p className="font-medium">
                  {c("The pipeline could not map this rule. The query below is unmapped.")}
                </p>
                <p className="mt-1 break-words text-muted-foreground">{t.pipeline_error}</p>
              </div>
            </div>
          ) : null}
          {t.error ? (
            <div className="rounded-md border border-sev-medium/30 bg-sev-medium/8 p-3 text-xs">
              <p className="font-medium">{c("Not supported by this backend")}</p>
              <p className="mt-1 break-words text-muted-foreground">{t.error}</p>
            </div>
          ) : (
            <div className="space-y-2" data-testid={`translation-${t.target}`}>
              {t.queries.map((q, i) => (
                <CodeBlock key={i} code={q} title={t.language} maxHeight="16rem" wrap />
              ))}
            </div>
          )}
          <FieldMapping translation={t} />
          {t.notes.map((n) => (
            <p key={n} className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {localizeTranslationNote(n, c)}
            </p>
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}
