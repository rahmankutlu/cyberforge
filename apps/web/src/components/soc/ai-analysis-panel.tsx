"use client";

import type {
  AIAnalysisContent,
  AIAnalysisRecord,
  AIStatus,
  AnalyzeResponse,
} from "@cyberforge/types";
import { Badge, Button, Card, CardContent, EmptyState } from "@cyberforge/ui";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { apiGet, apiSend } from "@/lib/api";
import { formatDateTimeFull } from "@/lib/format";

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <ul className="list-disc space-y-1 pl-5 text-[13px]">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function AnalysisView({ analysis, meta }: { analysis: AIAnalysisContent; meta: string }) {
  // Every field is rendered as plain text by React; model output is never interpreted as HTML.
  return (
    <Card data-testid="ai-analysis">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">
            <Sparkles className="size-3" /> AI-generated analysis
          </Badge>
          <span className="text-xs text-muted-foreground">{meta}</span>
        </div>
        <div>
          <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Summary
          </h4>
          <p className="text-[13px] leading-relaxed">{analysis.summary}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Severity explanation
            </h4>
            <p className="text-[13px] leading-relaxed">{analysis.severity_explanation}</p>
          </div>
          <div>
            <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Likely MITRE technique
            </h4>
            <p className="text-[13px] leading-relaxed">{analysis.likely_technique}</p>
          </div>
        </div>
        <div>
          <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Why the rule triggered
          </h4>
          <p className="text-[13px] leading-relaxed">{analysis.why_rule_triggered}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <List title="Evidence worth reviewing" items={analysis.evidence_to_review} />
          <List title="Recommended investigation steps" items={analysis.investigation_steps} />
          <List title="Potential false positives" items={analysis.false_positives} />
          <List
            title="Containment suggestions (for a human to decide)"
            items={analysis.containment_suggestions}
          />
        </div>
      </CardContent>
    </Card>
  );
}

export function AiAnalysisPanel({
  alertId,
  latest,
}: {
  alertId: number;
  latest: AIAnalysisRecord | null;
}) {
  const status = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => apiGet<AIStatus>("/ai/status"),
  });
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const analyze = useMutation({
    mutationFn: () => apiSend<AnalyzeResponse>("POST", "/ai/analyze-alert", { alert_id: alertId }),
    onSuccess: (data) => {
      setResult(data);
      if (data.available) toast.success("AI analysis complete");
    },
    onError: (error: Error) =>
      toast.error("Analysis request failed", { description: error.message }),
  });

  const shown: AnalyzeResponse | null = result;
  const enabled = status.data?.enabled ?? false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium">
            <Bot className="size-4 text-primary" /> AI SOC analyst{" "}
            <Badge variant="outline">optional</Badge>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {status.isLoading
              ? "Checking provider…"
              : enabled
                ? `Provider: ${status.data?.provider} · model ${status.data?.model}. Sends this alert's telemetry to that provider when you click Analyze.`
                : "Not configured. CyberForge works fully without AI."}
          </p>
        </div>
        <Button
          onClick={() => analyze.mutate()}
          disabled={analyze.isPending}
          data-testid="analyze-ai"
        >
          <Sparkles />
          {analyze.isPending ? "Analyzing…" : "Analyze with AI"}
        </Button>
      </div>

      {shown && !shown.available ? (
        <EmptyState
          icon={<ShieldAlert />}
          title="AI analysis is unavailable"
          description={shown.reason ?? "The provider could not be reached."}
          className="py-8"
        />
      ) : null}

      {shown?.available && shown.analysis ? (
        <AnalysisView
          analysis={shown.analysis}
          meta={`${shown.provider} · ${shown.model}${shown.created_at ? ` · ${formatDateTimeFull(shown.created_at)}` : ""}`}
        />
      ) : latest && !shown ? (
        <AnalysisView
          analysis={latest.content}
          meta={`Previous analysis · ${latest.provider} · ${latest.model} · ${formatDateTimeFull(latest.created_at)}`}
        />
      ) : null}

      <ul className="space-y-1 text-[11px] text-muted-foreground">
        {(
          status.data?.safety ?? [
            "Advisory only: suggestions are never executed and AI cannot run commands.",
          ]
        ).map((line) => (
          <li key={line} className="flex gap-1.5">
            <ShieldAlert className="mt-0.5 size-3 shrink-0" />
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}
