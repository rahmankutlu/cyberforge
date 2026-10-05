"use client";

import type { IncidentReport, ReportUpdate } from "@cyberforge/types";
import {
  Button,
  Input,
  Label,
  NativeSelect,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from "@cyberforge/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileJson, Plus, Save, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Markdown } from "@/components/markdown";
import { apiGet, apiSend } from "@/lib/api";
import { useLocale } from "@/components/i18n/locale-provider";

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

type Form = {
  status: "draft" | "final";
  executive_summary: string;
  timeline: { time: string; event: string }[];
  affected_assets: string;
  indicators: string;
  mitre_techniques: string;
  evidence: string;
  root_cause: string;
  containment: string;
  remediation: string;
  lessons_learned: string;
};

function toForm(report: IncidentReport): Form {
  return {
    status: report.status,
    executive_summary: report.executive_summary,
    timeline: report.timeline,
    affected_assets: report.affected_assets.join("\n"),
    indicators: report.indicators.join("\n"),
    mitre_techniques: report.mitre_techniques.join(", "),
    evidence: report.evidence,
    root_cause: report.root_cause,
    containment: report.containment,
    remediation: report.remediation,
    lessons_learned: report.lessons_learned,
  };
}

function toPayload(form: Form): ReportUpdate {
  return {
    status: form.status,
    executive_summary: form.executive_summary,
    timeline: form.timeline.filter((r) => r.time.trim() || r.event.trim()),
    affected_assets: lines(form.affected_assets),
    indicators: lines(form.indicators),
    mitre_techniques: form.mitre_techniques
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean),
    evidence: form.evidence,
    root_cause: form.root_cause,
    containment: form.containment,
    remediation: form.remediation,
    lessons_learned: form.lessons_learned,
  };
}

function Section({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function ReportEditor({
  investigationId,
  report,
}: {
  investigationId: number;
  report: IncidentReport;
}) {
  const { c } = useLocale();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Form>(() => toForm(report));
  const [dirty, setDirty] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      apiSend<IncidentReport>("PUT", `/investigations/${investigationId}/report`, toPayload(form)),
    onSuccess: () => {
      setDirty(false);
      toast.success(c("Report saved"));
      void queryClient.invalidateQueries({ queryKey: ["report-preview", investigationId] });
      router.refresh();
    },
    onError: (error: Error) =>
      toast.error(c("Could not save the report"), { description: error.message }),
  });

  const preview = useQuery({
    queryKey: ["report-preview", investigationId, dirty],
    queryFn: () =>
      apiGet<string>(`/investigations/${investigationId}/report/export`, { format: "markdown" }),
    enabled: !dirty,
  });

  const exportBase = `/api/v1/investigations/${investigationId}/report/export`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <NativeSelect
            aria-label={c("Report status")}
            value={form.status}
            onChange={(e) => set("status", e.target.value as "draft" | "final")}
            className="w-32"
          >
            <option value="draft">{c("Draft")}</option>
            <option value="final">{c("Final")}</option>
          </NativeSelect>
          {dirty ? <span className="text-xs text-sev-medium">{c("Unsaved changes")}</span> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a
              href={`${exportBase}?format=markdown`}
              download={`incident-${investigationId}.md`}
              data-testid="export-markdown"
            >
              <Download /> {c("Export Markdown")}
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href={`${exportBase}?format=json`}
              download={`incident-${investigationId}.json`}
              data-testid="export-json"
            >
              <FileJson /> {c("Export JSON")}
            </a>
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled
            title={c("PDF export is an extension point: see docs/architecture.md")}
          >
            {c("PDF (extension point)")}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!dirty || save.isPending}
            data-testid="save-report"
          >
            <Save /> {save.isPending ? c("Saving…") : c("Save report")}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">{c("Edit")}</TabsTrigger>
          <TabsTrigger value="preview">{c("Preview")}</TabsTrigger>
        </TabsList>

        <TabsContent value="edit">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <Section
                id="rep-summary"
                label={c("Executive summary")}
                hint={c("Three sentences for someone who will read nothing else.")}
              >
                <Textarea
                  id="rep-summary"
                  rows={4}
                  value={form.executive_summary}
                  onChange={(e) => set("executive_summary", e.target.value)}
                />
              </Section>
              <Section id="rep-assets" label={c("Affected assets")} hint={c("One per line.")}>
                <Textarea
                  id="rep-assets"
                  rows={3}
                  value={form.affected_assets}
                  onChange={(e) => set("affected_assets", e.target.value)}
                />
              </Section>
              <Section
                id="rep-ind"
                label={c("Indicators")}
                hint={c("One per line: addresses, domains, hashes, accounts.")}
              >
                <Textarea
                  id="rep-ind"
                  rows={3}
                  value={form.indicators}
                  onChange={(e) => set("indicators", e.target.value)}
                  className="font-mono text-xs"
                />
              </Section>
              <Section
                id="rep-mitre"
                label={c("MITRE techniques")}
                hint={c(
                  "Comma-separated identifiers, e.g. T1059.001, T1110.001. Unknown identifiers are rejected.",
                )}
              >
                <Input
                  id="rep-mitre"
                  value={form.mitre_techniques}
                  onChange={(e) => set("mitre_techniques", e.target.value)}
                  className="font-mono"
                />
              </Section>
              <Section id="rep-evidence" label={c("Evidence")}>
                <Textarea
                  id="rep-evidence"
                  rows={4}
                  value={form.evidence}
                  onChange={(e) => set("evidence", e.target.value)}
                />
              </Section>
            </div>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>{c("Incident timeline")}</Label>
                <div className="space-y-1.5">
                  {form.timeline.map((row, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        aria-label={`${c("Timeline time")} ${i + 1}`}
                        value={row.time}
                        onChange={(e) =>
                          set(
                            "timeline",
                            form.timeline.map((r, j) =>
                              j === i ? { ...r, time: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder="2026-09-29T10:00:00Z"
                        className="w-52 font-mono text-xs"
                      />
                      <Input
                        aria-label={`${c("Timeline event")} ${i + 1}`}
                        value={row.event}
                        onChange={(e) =>
                          set(
                            "timeline",
                            form.timeline.map((r, j) =>
                              j === i ? { ...r, event: e.target.value } : r,
                            ),
                          )
                        }
                        placeholder={c("What happened")}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`${c("Remove timeline row")} ${i + 1}`}
                        onClick={() =>
                          set(
                            "timeline",
                            form.timeline.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => set("timeline", [...form.timeline, { time: "", event: "" }])}
                  >
                    <Plus /> {c("Add row")}
                  </Button>
                </div>
              </div>
              <Section id="rep-root" label={c("Root cause")}>
                <Textarea
                  id="rep-root"
                  rows={3}
                  value={form.root_cause}
                  onChange={(e) => set("root_cause", e.target.value)}
                />
              </Section>
              <Section id="rep-contain" label={c("Containment")}>
                <Textarea
                  id="rep-contain"
                  rows={3}
                  value={form.containment}
                  onChange={(e) => set("containment", e.target.value)}
                />
              </Section>
              <Section id="rep-remed" label={c("Remediation")}>
                <Textarea
                  id="rep-remed"
                  rows={3}
                  value={form.remediation}
                  onChange={(e) => set("remediation", e.target.value)}
                />
              </Section>
              <Section id="rep-lessons" label={c("Lessons learned")}>
                <Textarea
                  id="rep-lessons"
                  rows={3}
                  value={form.lessons_learned}
                  onChange={(e) => set("lessons_learned", e.target.value)}
                />
              </Section>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="preview">
          {dirty ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              {c("Save the report to refresh the preview.")}
            </p>
          ) : preview.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div
              className="rounded-lg border border-border bg-card p-6"
              data-testid="report-preview"
            >
              <Markdown>{preview.data ?? ""}</Markdown>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
