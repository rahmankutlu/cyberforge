import type { Analyst, InvestigationSummary, Page } from "@cyberforge/types";
import { INVESTIGATION_STATUSES, SEVERITIES } from "@cyberforge/types";
import { EmptyState, Table, TBody, TD, TH, THead, TR } from "@cyberforge/ui";
import { Radar, UserRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { InvestigationStatusBadge, SeverityBadge, SyntheticBadge } from "@/components/badges";
import { Pagination } from "@/components/data/pagination";
import { SortTh } from "@/components/data/sort-th";
import { ClearFilters, PersistFilters, UrlChips, UrlSearch } from "@/components/data/url-filters";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { NewInvestigationDialog } from "@/components/soc/new-investigation-dialog";
import { apiGet } from "@/lib/api";
import { INVESTIGATION_STATUS_LABEL, SEVERITY_LABEL } from "@/lib/format";
import { all, first, positiveInt, type SearchParams } from "@/lib/params";

export const metadata = { title: "Investigations" };
const PAGE_SIZE = 15;

export default async function InvestigationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const sort = first(sp.sort) ?? "updated_at";
  const order = first(sp.order) === "asc" ? "asc" : "desc";
  const [result, analysts] = await Promise.all([
    apiGet<Page<InvestigationSummary>>("/investigations", {
      page: positiveInt(sp.page, 1),
      page_size: PAGE_SIZE,
      sort,
      order,
      q: first(sp.q),
      status: all(sp.status),
      severity: all(sp.severity),
    }),
    apiGet<Analyst[]>("/analysts"),
  ]);
  const sorting = { path: "/soc/investigations", params: sp, sort, order } as const;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Mini SOC", href: "/soc" }, { label: "Investigations" }]}
        title="Investigations"
        description="Cases that group related alerts, analyst notes, a timeline and an incident report."
        actions={<NewInvestigationDialog analysts={analysts} />}
      />
      <Suspense>
        <PersistFilters storageKey="investigations" />
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <UrlSearch
            placeholder="Search investigations…"
            className="w-full sm:w-72"
            label="Search investigations"
          />
          <UrlChips
            param="status"
            label="Status"
            options={INVESTIGATION_STATUSES.map((s) => ({
              value: s,
              label: INVESTIGATION_STATUS_LABEL[s],
            }))}
          />
          <UrlChips
            param="severity"
            label="Severity"
            options={SEVERITIES.slice(0, 4).map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))}
          />
          <ClearFilters keys={["q", "status", "severity"]} storageKey="investigations" />
        </div>
      </Suspense>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<Radar />}
          title="No investigations match"
          description="Create one from an alert, or start an empty case."
        />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <SortTh label="Investigation" column="title" {...sorting} />
              <SortTh label="Severity" column="severity" className="w-28" {...sorting} />
              <SortTh label="Status" column="status" className="w-32" {...sorting} />
              <TH className="w-40">Lead</TH>
              <TH className="w-20 text-right">Alerts</TH>
              <TH className="w-20 text-right">Notes</TH>
              <SortTh
                label="Updated"
                column="updated_at"
                defaultOrder="desc"
                className="w-28 text-right"
                {...sorting}
              />
            </TR>
          </THead>
          <TBody>
            {result.items.map((inv) => (
              <TR key={inv.id} data-testid="investigation-row">
                <TD className="max-w-md">
                  <Link
                    href={`/soc/investigations/${inv.id}`}
                    className="block truncate rounded font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {inv.title}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="font-mono">#{inv.id}</span>
                    {inv.synthetic ? <SyntheticBadge className="py-0" /> : null}
                  </p>
                </TD>
                <TD>
                  <SeverityBadge severity={inv.severity} />
                </TD>
                <TD>
                  <InvestigationStatusBadge status={inv.status} />
                </TD>
                <TD>
                  {inv.lead ? (
                    <span className="flex items-center gap-1.5 text-xs">
                      <UserRound className="size-3 text-muted-foreground" />
                      {inv.lead.name}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">No lead</span>
                  )}
                </TD>
                <TD className="text-right tabular-nums">{inv.alert_count}</TD>
                <TD className="text-right tabular-nums">{inv.note_count}</TD>
                <TD className="text-right text-xs text-muted-foreground">
                  <RelativeTime iso={inv.updated_at} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
      <Pagination
        page={result.page}
        pages={result.pages}
        total={result.total}
        pageSize={result.page_size}
        path="/soc/investigations"
        params={sp}
        noun="investigations"
      />
    </>
  );
}
