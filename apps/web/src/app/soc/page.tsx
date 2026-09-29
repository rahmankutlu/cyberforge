import type {
  AlertStats,
  AlertSummary,
  EventSummary,
  InvestigationSummary,
  Page,
} from "@cyberforge/types";
import { SEVERITIES } from "@cyberforge/types";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@cyberforge/ui";
import { Activity, ArrowRight, Radar, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { InvestigationStatusBadge, SeverityBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { AlertsTable } from "@/components/soc/alerts-table";
import { apiGet } from "@/lib/api";
import { ALERT_STATUS_LABEL, SEVERITY_LABEL, formatDateTime } from "@/lib/format";

export const metadata = { title: "Mini SOC" };

export default async function SocHomePage() {
  const [stats, urgent, investigations, events] = await Promise.all([
    apiGet<AlertStats>("/alerts/stats"),
    apiGet<Page<AlertSummary>>("/alerts", {
      severity: ["critical", "high"],
      status: ["new", "investigating"],
      page_size: 6,
      sort: "severity",
      order: "asc",
    }),
    apiGet<Page<InvestigationSummary>>("/investigations", {
      status: ["open", "in_progress"],
      page_size: 5,
    }),
    apiGet<Page<EventSummary>>("/events", { page_size: 6 }),
  ]);

  return (
    <>
      <PageHeader
        title="Mini SOC"
        description="A compact security operations workspace: triage alerts, browse events, run investigations and write incident reports."
        actions={
          <Button asChild>
            <Link href="/soc/alerts">
              <ShieldAlert /> Open the alert queue
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {SEVERITIES.slice(0, 4).map((sev) => (
          <Link
            key={sev}
            href={`/soc/alerts?severity=${sev}&status=new&status=investigating`}
            className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Card className="p-4 transition-colors hover:border-primary/40">
              <SeverityBadge severity={sev} />
              <p className="mt-3 text-2xl font-semibold tabular-nums">
                {stats.by_severity[sev] ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {SEVERITY_LABEL[sev]} alerts in total
              </p>
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="xl:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Needs attention</h2>
            <span className="text-xs text-muted-foreground">
              Critical and high, not yet resolved
            </span>
          </div>
          <AlertsTable
            alerts={urgent.items}
            compact
            emptyTitle="Nothing urgent"
            emptyDescription="No critical or high alerts are open. Run a lab to generate some."
          />
        </section>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radar className="size-4" /> Active investigations
              </CardTitle>
              <CardDescription>{investigations.total} open or in progress</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-3">
              {investigations.items.map((inv) => (
                <Link
                  key={inv.id}
                  href={`/soc/investigations/${inv.id}`}
                  className="block rounded-md border border-border p-2.5 transition-colors hover:border-primary/40 hover:bg-muted/30"
                >
                  <p className="line-clamp-2 text-[13px] font-medium">{inv.title}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <SeverityBadge severity={inv.severity} />
                    <InvestigationStatusBadge status={inv.status} />
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {inv.alert_count} alerts
                    </span>
                  </div>
                </Link>
              ))}
              {investigations.items.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">None active.</p>
              ) : null}
              <Button asChild variant="ghost" size="sm" className="w-full">
                <Link href="/soc/investigations">
                  All investigations <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4" /> Latest events
              </CardTitle>
              <CardDescription>
                {stats.open} open alerts · statuses:{" "}
                {Object.entries(stats.by_status)
                  .map(
                    ([k, v]) => `${ALERT_STATUS_LABEL[k as keyof typeof ALERT_STATUS_LABEL]} ${v}`,
                  )
                  .join(" · ")}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-3">
              <ul className="space-y-2">
                {events.items.map((e) => (
                  <li key={e.id} className="text-xs">
                    <p className="truncate">{e.message}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {formatDateTime(e.timestamp)} · {e.source}
                    </p>
                  </li>
                ))}
              </ul>
              <Button asChild variant="ghost" size="sm" className="mt-2 w-full">
                <Link href="/soc/events">
                  Browse events <ArrowRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
      <p className="mt-6 text-center text-[11px] text-muted-foreground">
        Latest alert <RelativeTime iso={urgent.items[0]?.timestamp ?? new Date().toISOString()} />.
        Data is synthetic unless marked live.
      </p>
    </>
  );
}
