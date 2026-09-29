"use client";

import type { LabRunDetail } from "@cyberforge/types";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, Play, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { SeverityBadge } from "@/components/badges";
import { apiSend } from "@/lib/api";

export function LabRunner({
  slug,
  title,
  expectedRules,
  requiresContainers,
  allowedTargets,
}: {
  slug: string;
  title: string;
  expectedRules: string[];
  requiresContainers: boolean;
  allowedTargets: string[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState("");
  const [result, setResult] = useState<LabRunDetail | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      apiSend<LabRunDetail>("POST", "/lab-runs", { lab_slug: slug, target: target.trim() || null }),
    onSuccess: (run) => {
      setResult(run);
      toast.success("Simulation complete", {
        description: `${run.events_generated} events → ${run.alerts_generated} alerts`,
      });
      router.refresh();
    },
    onError: (error: Error) => toast.error("Simulation was not started", { description: error.message }),
  });

  return (
    <Card className="sticky top-20">
      <CardHeader>
        <CardTitle>Run safe simulation</CardTitle>
        <CardDescription>
          Replays this lab&apos;s telemetry, runs detections and creates alerts. No packets leave CyberForge.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button className="w-full" onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="run-lab">
          <Play />
          {mutation.isPending ? "Running…" : "Start simulation"}
        </Button>

        <details className="group rounded-md border border-border px-2.5 py-2 text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground group-open:mb-2">Target (optional)</summary>
          <Label htmlFor="lab-target">Lab target</Label>
          <Input id="lab-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder={allowedTargets[0] ?? "localhost"} className="mt-1" spellCheck={false} />
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
            Only <code className="font-mono">localhost</code>, private addresses and <code className="font-mono">*.lab.internal</code> are accepted. External hosts and URLs are rejected.
          </p>
        </details>

        {requiresContainers ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            This lab also has an optional live mode with an intentionally vulnerable container. The simulation works without it.
          </p>
        ) : null}

        {result ? (
          <div className="space-y-3 border-t border-border pt-3" data-testid="run-result">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md border border-border p-2">
                <p className="text-lg font-semibold tabular-nums">{result.events_generated}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Events</p>
              </div>
              <div className="rounded-md border border-border p-2">
                <p className="text-lg font-semibold tabular-nums" data-testid="run-alert-count">{result.alerts_generated}</p>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Alerts</p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Expected detections ({result.fired_rules.length}/{expectedRules.length} fired)
              </p>
              <ul className="space-y-1">
                {expectedRules.map((rule) => {
                  const fired = result.fired_rules.includes(rule);
                  return (
                    <li key={rule} className="flex items-center gap-1.5 text-xs">
                      {fired ? <CheckCircle2 className="size-3.5 text-ok" /> : <CircleAlert className="size-3.5 text-sev-high" />}
                      <Link href={`/detections/${rule}`} className="truncate font-mono hover:text-primary">{rule}</Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Generated alerts</p>
              <ul className="space-y-1.5">
                {result.alerts.map((alert) => (
                  <li key={alert.id}>
                    <Link href={`/soc/alerts/${alert.id}?tab=lifecycle`} className="flex items-start gap-2 rounded-md border border-border p-2 transition-colors hover:border-primary/40 hover:bg-muted/40">
                      <SeverityBadge severity={alert.severity} />
                      <span className="line-clamp-2 text-xs">{alert.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-ok" />
              Run #{result.id} on “{title}”. <Badge variant="outline" className="ml-1">synthetic</Badge>
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
