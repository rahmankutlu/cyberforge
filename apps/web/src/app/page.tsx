import type { Dashboard, QualityResponse } from "@cyberforge/types";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
} from "@cyberforge/ui";
import {
  Activity,
  ArrowRight,
  Crosshair,
  FlaskConical,
  BookOpenCheck,
  Grid3x3,
  MonitorPlay,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import Link from "next/link";

import { InvestigationStatusBadge, SeverityBadge, SyntheticBadge } from "@/components/badges";
import { TimelineChart } from "@/components/charts/lazy";
import { GenerateTelemetryButton } from "@/components/dashboard/demo-actions";
import { LiveStream } from "@/components/dashboard/live-stream";
import { PostureGauge, postureTone } from "@/components/dashboard/posture-gauge";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { AlertsTable } from "@/components/soc/alerts-table";
import { StatCard } from "@/components/stat-card";
import { apiGet } from "@/lib/api";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "Dashboard" };

const BREAKDOWN_LABELS: Record<string, string> = {
  detection_coverage: "Detection coverage",
  alerts_handled: "Alerts handled",
  open_alert_pressure: "Open-alert pressure (higher is better)",
};

export default async function DashboardPage() {
  const [data, quality] = await Promise.all([
    apiGet<Dashboard>("/dashboard"),
    apiGet<QualityResponse>("/detections/quality"),
  ]);
  const kpi = Object.fromEntries(data.kpis.map((k) => [k.key, k]));
  const tone = postureTone(data.posture_score);
  const open = kpi["open_alerts"];

  return (
    <>
      <PageHeader
        title="Security dashboard"
        description="Attack simulation, telemetry, detection and response in one place. Everything here comes from seeded synthetic data or your own local lab activity."
        actions={
          <>
            {data.demo_mode ? <GenerateTelemetryButton /> : null}
            <Button asChild>
              <Link href="/labs">
                <FlaskConical /> Run a lab
              </Link>
            </Button>
          </>
        }
        meta={data.demo_mode ? <SyntheticBadge /> : null}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Security posture"
          value={<span className={tone.className}>{tone.label}</span>}
          hint="Demo metric: coverage, handled alerts, open-alert pressure."
        >
          <div className="mt-3 flex items-center gap-3">
            <PostureGauge score={data.posture_score} />
            <dl className="min-w-0 flex-1 space-y-1 text-[10px] text-muted-foreground">
              {Object.entries(data.posture_breakdown).map(([key, value]) => (
                <div
                  key={key}
                  className="flex justify-between gap-1"
                  title={BREAKDOWN_LABELS[key] ?? key}
                >
                  <dt className="truncate">{(BREAKDOWN_LABELS[key] ?? key).split(" (")[0]}</dt>
                  <dd className="tabular-nums text-foreground">{Math.round(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </StatCard>
        <StatCard
          label="Active labs"
          value={formatNumber(kpi["active_labs"]?.value ?? 0)}
          hint={kpi["active_labs"]?.hint}
          icon={FlaskConical}
          href="/labs"
        />
        <StatCard
          label="Open alerts"
          value={formatNumber(open?.value ?? 0)}
          hint={open?.hint}
          icon={ShieldAlert}
          href="/soc/alerts?status=new&status=investigating"
          tone={(open?.value ?? 0) > 0 ? "high" : "ok"}
        />
        <StatCard
          label="Detection rules"
          value={formatNumber(kpi["rules"]?.value ?? 0)}
          hint={kpi["rules"]?.hint}
          icon={Crosshair}
          href="/detections"
        />
        <StatCard
          label="MITRE techniques covered"
          value={formatNumber(kpi["techniques"]?.value ?? 0)}
          hint={kpi["techniques"]?.hint}
          icon={Grid3x3}
          href="/mitre"
        />
        <StatCard
          label="Events processed"
          value={formatNumber(kpi["events"]?.value ?? 0)}
          hint={kpi["events"]?.hint}
          icon={Activity}
          href="/soc/events"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Security event timeline</CardTitle>
            <CardDescription>
              Alerts per 6 hours over the last 7 days, by severity (UTC).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TimelineChart data={data.timeline} />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {(["critical", "high", "medium", "low"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1.5 capitalize">
                  <span className="size-2 rounded-sm" style={{ background: `var(--sev-${s})` }} />
                  {s}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Detection coverage by tactic</CardTitle>
            <CardDescription>ATT&CK techniques with at least one enabled rule.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {data.coverage
              .filter((c) => c.total > 0)
              .map((c) => (
                <Link
                  key={c.tactic.id}
                  href={`/mitre?view=matrix`}
                  className="block rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span>{c.tactic.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {c.covered}/{c.total}
                    </span>
                  </div>
                  <Progress value={c.covered} max={c.total} label={`${c.tactic.name} coverage`} />
                </Link>
              ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <LiveStream />

        <Card data-testid="detection-coverage">
          <CardHeader>
            <CardTitle>Detection test coverage</CardTitle>
            <CardDescription>Calculated from the repository on every run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-semibold tabular-nums">
              {quality.coverage.percent}
              <span className="text-lg text-muted-foreground">%</span>
            </p>
            <Progress
              value={quality.coverage.tested}
              max={Math.max(quality.coverage.rules, 1)}
              label="Sigma rules with positive and negative tests"
            />
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/50 p-2">
                <dt className="text-muted-foreground">Rules tested</dt>
                <dd className="text-base font-semibold tabular-nums">
                  {quality.coverage.tested}/{quality.coverage.rules}
                </dd>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <dt className="text-muted-foreground">Tests</dt>
                <dd className="text-base font-semibold tabular-nums">
                  {quality.coverage.tests}
                  {quality.coverage.failing ? (
                    <span className="ml-1 text-xs font-normal text-sev-critical">
                      {quality.coverage.failing} failing
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-muted-foreground">
              {quality.checks_passed} of {quality.checks_total} quality checks pass.{" "}
              <Link href="/detections" className="text-primary hover:underline">
                See every rule
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {[
          {
            href: "/demo",
            icon: MonitorPlay,
            title: "Live demo",
            text: "Watch a phishing-to-credential-theft incident unfold: telemetry, detections, alerts, MITRE and containment in 80 seconds.",
          },
          {
            href: "/stories",
            icon: BookOpenCheck,
            title: "Attack stories",
            text: "Investigate five complete incidents: reveal the evidence, answer the questions, make the calls.",
          },
          {
            href: "/lifecycle",
            icon: Workflow,
            title: "Attack → Log → Detection",
            text: "Follow one alert from simulation to raw event, rule match, MITRE technique and mitigation.",
          },
        ].map(({ href, icon: Icon, title, text }) => (
          <Link
            key={href}
            href={href}
            className="group rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardContent className="flex h-full flex-col gap-1.5 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="size-4 text-primary" aria-hidden /> {title}
                  <ArrowRight
                    className="ml-auto size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">{text}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="xl:col-span-2" aria-labelledby="recent-alerts">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="recent-alerts" className="text-sm font-semibold">
              Recent alerts
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/soc/alerts">
                View all <ArrowRight />
              </Link>
            </Button>
          </div>
          <AlertsTable alerts={data.recent_alerts} compact showSynthetic={false} />
        </section>

        <section aria-labelledby="recent-investigations">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="recent-investigations" className="text-sm font-semibold">
              Recent investigations
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/soc/investigations">
                View all <ArrowRight />
              </Link>
            </Button>
          </div>
          <Card>
            <ul className="divide-y divide-border">
              {data.recent_investigations.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/soc/investigations/${inv.id}`}
                    className="block px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <p className="line-clamp-2 text-[13px] font-medium">{inv.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={inv.severity} />
                      <InvestigationStatusBadge status={inv.status} />
                      <RelativeTime
                        iso={inv.updated_at}
                        className="text-[11px] text-muted-foreground"
                      />
                    </div>
                  </Link>
                </li>
              ))}
              {data.recent_investigations.length === 0 ? (
                <li className="px-4 py-8 text-center text-xs text-muted-foreground">
                  No investigations yet.
                </li>
              ) : null}
            </ul>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>Lab progress</CardTitle>
              <CardDescription>
                {data.lab_progress.run} of {data.lab_progress.total} labs run on this instance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress
                value={data.lab_progress.run}
                max={data.lab_progress.total}
                label="Labs run"
              />
            </CardContent>
          </Card>
        </section>
      </div>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">{data.synthetic_notice}</p>
    </>
  );
}
