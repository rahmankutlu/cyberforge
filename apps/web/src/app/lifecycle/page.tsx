import type { AlertSummary, Lifecycle, Page } from "@cyberforge/types";
import { Card, EmptyState, cn } from "@cyberforge/ui";
import { Workflow } from "lucide-react";
import Link from "next/link";

import { SeverityBadge } from "@/components/badges";
import { LifecycleFlow } from "@/components/lifecycle/lifecycle-flow";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";
import { first, type SearchParams } from "@/lib/params";

export const metadata = { title: "Attack → Log → Detection" };

export default async function LifecyclePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const list = await apiGet<Page<AlertSummary>>("/alerts", {
    page_size: 14,
    sort: "severity",
    order: "asc",
  });
  const featured =
    list.items.find((a) => a.rule?.slug === "win-encoded-powershell-command") ?? list.items[0];
  const requested = Number.parseInt(first(sp.alert) ?? "", 10);
  const selectedId = Number.isFinite(requested) ? requested : featured?.id;

  if (!selectedId) {
    return (
      <>
        <PageHeader
          title="Attack → Log → Detection"
          description="Run a lab to generate an alert, then trace it here."
        />
        <EmptyState
          icon={<Workflow />}
          title="No alerts yet"
          description="Start any lab simulation and its alerts will appear here."
        />
      </>
    );
  }

  const data = await apiGet<Lifecycle>(`/alerts/${selectedId}/lifecycle`);
  const items = list.items.some((a) => a.id === selectedId)
    ? list.items
    : [data.alert, ...list.items];

  return (
    <>
      <PageHeader
        title="Attack → Log → Detection"
        description="One alert, traced from the simulated attack through the raw log, parsed fields, rule match, MITRE technique and investigation, to mitigation. Every stage is real data from this instance."
      />
      <div className="grid gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label="Choose an alert" className="lg:sticky lg:top-20 lg:h-fit">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Trace an alert
          </p>
          <Card className="max-h-[70vh] overflow-y-auto p-1">
            <ul>
              {items.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/lifecycle?alert=${a.id}`}
                    aria-current={a.id === selectedId ? "true" : undefined}
                    className={cn(
                      "block rounded-md px-2.5 py-2 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                      a.id === selectedId && "bg-primary/10",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <SeverityBadge severity={a.severity} />
                      <span className="font-mono text-[10px] text-muted-foreground">#{a.id}</span>
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs">{a.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </nav>

        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={data.alert.severity} />
            <h2 className="text-base font-semibold">{data.alert.title}</h2>
            <Link
              href={`/soc/alerts/${data.alert.id}`}
              className="text-xs text-primary hover:underline"
            >
              Open alert #{data.alert.id}
            </Link>
          </div>
          <LifecycleFlow key={data.alert.id} data={data} initialStage="raw" />
        </div>
      </div>
    </>
  );
}
