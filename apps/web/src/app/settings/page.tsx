import type { RuntimeSettings } from "@cyberforge/types";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cyberforge/ui";
import { ShieldCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { DemoResetButton, LearningProgressActions } from "@/components/settings/settings-actions";
import { apiGet } from "@/lib/api";
import { formatNumber, titleCase } from "@/lib/format";

export const metadata = { title: "Settings" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-[13px]">{children}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  const s = await apiGet<RuntimeSettings>("/settings/runtime");
  return (
    <>
      <PageHeader
        title="Settings"
        description="Runtime configuration is read from environment variables (see .env.example). This page shows what the running instance is using; secrets are never displayed."
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Instance</CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <Row label="Version">v{s.version}</Row>
              <Row label="Environment">
                <Badge variant={s.env === "production" ? "warning" : "outline"}>{s.env}</Badge>
              </Row>
              <Row label="Demo mode">
                {s.demo_mode ? (
                  <Badge variant="accent">on: synthetic data</Badge>
                ) : (
                  <Badge variant="outline">off</Badge>
                )}
              </Row>
              <Row label="MITRE data">
                {Object.entries(s.content.mitre)
                  .map(([k, v]) => `${k.toUpperCase()} ${v}`)
                  .join(" · ")}
              </Row>
              <Row label="Content">
                {s.content.labs} labs · {s.content.rules} rules · {s.content.docs} docs
              </Row>
              {Object.entries(s.counts).map(([k, v]) => (
                <Row key={k} label={titleCase(k)}>
                  <span className="tabular-nums">{formatNumber(v)}</span>
                </Row>
              ))}
            </dl>
            {s.demo_mode ? (
              <div className="mt-3">
                <DemoResetButton />
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI analyst</CardTitle>
              <CardDescription>
                Optional. CyberForge is fully functional without it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label="Status">
                  {s.ai.enabled ? (
                    <Badge variant="success">enabled</Badge>
                  ) : (
                    <Badge variant="outline">not configured</Badge>
                  )}
                </Row>
                <Row label="Provider">{s.ai.provider}</Row>
                {s.ai.model ? <Row label="Model">{s.ai.model}</Row> : null}
              </dl>
              {s.ai.reason ? (
                <p className="mt-2 text-xs text-muted-foreground">{s.ai.reason}</p>
              ) : null}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Set <code className="font-mono">CYBERFORGE_AI_PROVIDER</code> (
                <code className="font-mono">openai</code>, <code className="font-mono">gemini</code>{" "}
                or <code className="font-mono">ollama</code>),{" "}
                <code className="font-mono">CYBERFORGE_AI_MODEL</code> and, where needed,{" "}
                <code className="font-mono">CYBERFORGE_AI_API_KEY</code>. Use Ollama to keep
                telemetry on your machine.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-ok" /> Lab network
              </CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                {Object.entries(s.lab_network).map(([k, v]) => (
                  <Row key={k} label={titleCase(k)}>
                    {v}
                  </Row>
                ))}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Learning progress</CardTitle>
              <CardDescription>
                Stored in this browser. You can optionally back it up to this instance under an
                anonymous profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LearningProgressActions />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
