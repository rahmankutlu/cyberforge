import type { Dashboard, QualityResponse } from "@cyberforge/types";
import type { Metadata } from "next";
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
import { createTranslator, type Locale } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import { localizeContentTree } from "@/lib/i18n/content";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return { title: t("nav.dashboard") };
}

function breakdownLabels(locale: Locale): Record<string, string> {
  const t = createTranslator(locale);
  return {
    detection_coverage: t("dashboard.detectionCoverage"),
    alerts_handled: t("dashboard.alertsHandled"),
    open_alert_pressure: t("dashboard.openAlertPressure"),
  };
}

export default async function DashboardPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);
  const breakdown = breakdownLabels(locale);
  const [data, quality] = await Promise.all([
    apiGet<Dashboard>("/dashboard"),
    apiGet<QualityResponse>("/detections/quality"),
  ]);
  const kpi = Object.fromEntries(data.kpis.map((k) => [k.key, k]));
  const tone = postureTone(data.posture_score, locale);
  const open = kpi["open_alerts"];

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        actions={
          <>
            {data.demo_mode ? <GenerateTelemetryButton /> : null}
            <Button asChild>
              <Link href="/labs">
                <FlaskConical /> {t("dashboard.runLab")}
              </Link>
            </Button>
          </>
        }
        meta={data.demo_mode ? <SyntheticBadge /> : null}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label={t("dashboard.securityPosture")}
          value={<span className={tone.className}>{tone.label}</span>}
          hint={t("dashboard.postureHint")}
        >
          <div className="mt-3 flex items-center gap-3">
            <PostureGauge score={data.posture_score} locale={locale} />
            <dl className="min-w-0 flex-1 space-y-1 text-[10px] text-muted-foreground">
              {Object.entries(data.posture_breakdown).map(([key, value]) => (
                <div key={key} className="flex justify-between gap-1" title={breakdown[key] ?? key}>
                  <dt className="truncate">{breakdown[key] ?? key}</dt>
                  <dd className="tabular-nums text-foreground">{Math.round(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </StatCard>
        <StatCard
          label={t("dashboard.activeLabs")}
          value={formatNumber(kpi["active_labs"]?.value ?? 0, locale)}
          hint={t("dashboard.activeLabsHint")}
          icon={FlaskConical}
          href="/labs"
        />
        <StatCard
          label={t("dashboard.openAlerts")}
          value={formatNumber(open?.value ?? 0, locale)}
          hint={t("dashboard.openAlertsHint")}
          icon={ShieldAlert}
          href="/soc/alerts?status=new&status=investigating"
          tone={(open?.value ?? 0) > 0 ? "high" : "ok"}
        />
        <StatCard
          label={t("dashboard.detectionRules")}
          value={formatNumber(kpi["rules"]?.value ?? 0, locale)}
          hint={t("dashboard.detectionRulesHint")}
          icon={Crosshair}
          href="/detections"
        />
        <StatCard
          label={t("dashboard.mitreCovered")}
          value={formatNumber(kpi["techniques"]?.value ?? 0, locale)}
          hint={t("dashboard.mitreCoveredHint")}
          icon={Grid3x3}
          href="/mitre"
        />
        <StatCard
          label={t("dashboard.eventsProcessed")}
          value={formatNumber(kpi["events"]?.value ?? 0, locale)}
          hint={t("dashboard.eventsProcessedHint")}
          icon={Activity}
          href="/soc/events"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{t("dashboard.eventTimeline")}</CardTitle>
            <CardDescription>{t("dashboard.eventTimelineDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <TimelineChart data={data.timeline} />
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {(["critical", "high", "medium", "low"] as const).map((s) => (
                <span key={s} className="flex items-center gap-1.5 capitalize">
                  <span className="size-2 rounded-sm" style={{ background: `var(--sev-${s})` }} />
                  {t(`severity.${s}`)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.coverageByTactic")}</CardTitle>
            <CardDescription>{t("dashboard.coverageByTacticDescription")}</CardDescription>
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
                  <Progress
                    value={c.covered}
                    max={c.total}
                    label={t("dashboard.coverageLabel", { name: c.tactic.name })}
                  />
                </Link>
              ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <LiveStream />

        <Card data-testid="detection-coverage">
          <CardHeader>
            <CardTitle>{t("dashboard.testCoverage")}</CardTitle>
            <CardDescription>{t("dashboard.testCoverageDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-3xl font-semibold tabular-nums">
              {quality.coverage.percent}
              <span className="text-lg text-muted-foreground">%</span>
            </p>
            <Progress
              value={quality.coverage.tested}
              max={Math.max(quality.coverage.rules, 1)}
              label={t("dashboard.sigmaCoverageLabel")}
            />
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/50 p-2">
                <dt className="text-muted-foreground">{t("dashboard.rulesTested")}</dt>
                <dd className="text-base font-semibold tabular-nums">
                  {quality.coverage.tested}/{quality.coverage.rules}
                </dd>
              </div>
              <div className="rounded-md bg-muted/50 p-2">
                <dt className="text-muted-foreground">{t("dashboard.tests")}</dt>
                <dd className="text-base font-semibold tabular-nums">
                  {quality.coverage.tests}
                  {quality.coverage.failing ? (
                    <span className="ml-1 text-xs font-normal text-sev-critical">
                      {t("dashboard.failing", { count: quality.coverage.failing })}
                    </span>
                  ) : null}
                </dd>
              </div>
            </dl>
            <p className="text-[11px] text-muted-foreground">
              {t("dashboard.qualityChecks", {
                passed: quality.checks_passed,
                total: quality.checks_total,
              })}{" "}
              <Link
                href="/detections"
                className="text-primary underline underline-offset-2 hover:no-underline"
              >
                {t("dashboard.seeEveryRule")}
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
            title: t("dashboard.card.liveDemoTitle"),
            text: t("dashboard.card.liveDemoText"),
          },
          {
            href: "/stories",
            icon: BookOpenCheck,
            title: t("dashboard.card.storiesTitle"),
            text: t("dashboard.card.storiesText"),
          },
          {
            href: "/lifecycle",
            icon: Workflow,
            title: t("dashboard.card.lifecycleTitle"),
            text: t("dashboard.card.lifecycleText"),
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
              {t("dashboard.recentAlerts")}
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/soc/alerts">
                {t("dashboard.viewAll")} <ArrowRight />
              </Link>
            </Button>
          </div>
          <AlertsTable
            alerts={localizeContentTree(locale, data.recent_alerts)}
            compact
            showSynthetic={false}
          />
        </section>

        <section aria-labelledby="recent-investigations">
          <div className="mb-2 flex items-center justify-between">
            <h2 id="recent-investigations" className="text-sm font-semibold">
              {t("dashboard.recentInvestigations")}
            </h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/soc/investigations">
                {t("dashboard.viewAll")} <ArrowRight />
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
                  {t("dashboard.noInvestigations")}
                </li>
              ) : null}
            </ul>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>{t("dashboard.labProgress")}</CardTitle>
              <CardDescription>
                {t("dashboard.labProgressDescription", {
                  run: data.lab_progress.run,
                  total: data.lab_progress.total,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Progress
                value={data.lab_progress.run}
                max={data.lab_progress.total}
                label={t("dashboard.labsRun")}
              />
            </CardContent>
          </Card>
        </section>
      </div>

      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        {t("dashboard.syntheticNotice")}
      </p>
    </>
  );
}
