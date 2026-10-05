"use client";

import type { TranslateResponse, TranslateTarget } from "@cyberforge/types";
import { EmptyState, Tabs, TabsContent, TabsList, TabsTrigger } from "@cyberforge/ui";
import { XCircle } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import { useLocale } from "@/components/i18n/locale-provider";

export const TARGETS: { id: TranslateTarget; label: string }[] = [
  { id: "elastic", label: "Elastic" },
  { id: "splunk", label: "Splunk SPL" },
  { id: "sentinel", label: "Sentinel / KQL" },
  { id: "opensearch", label: "OpenSearch" },
  { id: "sql", label: "SQL-like" },
];

export function TranslationView({ result }: { result: TranslateResponse }) {
  const { c } = useLocale();
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
          <p className="mb-2 text-xs text-muted-foreground">
            {t.label} · {t.language}
          </p>
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
          {t.notes.map((n) => (
            <p key={n} className="mt-2 text-[11px] leading-snug text-muted-foreground">
              {n}
            </p>
          ))}
        </TabsContent>
      ))}
    </Tabs>
  );
}
