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
import { all, first, positiveInt, type SearchParams } from "@/lib/params";
import { createTranslator } from "@/lib/i18n";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { localizeContentTree } from "@/lib/i18n/content";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("Investigations") };
}
const PAGE_SIZE = 15;

export default async function InvestigationsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const t = createTranslator(locale);
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
  const localizedResult = localizeContentTree(locale, result);
  const sorting = { path: "/soc/investigations", params: sp, sort, order } as const;
  const statusLabels = {
    open: t("investigationStatus.open"),
    in_progress: t("investigationStatus.inProgress"),
    contained: t("investigationStatus.contained"),
    closed: t("investigationStatus.closed"),
  };
  const severityLabels = {
    critical: t("severity.critical"),
    high: t("severity.high"),
    medium: t("severity.medium"),
    low: t("severity.low"),
    informational: t("severity.informational"),
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: c("Mini SOC"), href: "/soc" }, { label: c("Investigations") }]}
        title={c("Investigations")}
        description={c(
          "Cases that group related alerts, analyst notes, a timeline and an incident report.",
        )}
        actions={<NewInvestigationDialog analysts={analysts} />}
      />
      <Suspense>
        <PersistFilters storageKey="investigations" />
        <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <UrlSearch
            placeholder={c("Search investigations…")}
            className="w-full sm:w-72"
            label={c("Search investigations")}
          />
          <UrlChips
            param="status"
            label={c("Status")}
            options={INVESTIGATION_STATUSES.map((s) => ({
              value: s,
              label: statusLabels[s],
            }))}
          />
          <UrlChips
            param="severity"
            label={c("Severity")}
            options={SEVERITIES.slice(0, 4).map((s) => ({
              value: s,
              label: severityLabels[s],
            }))}
          />
          <ClearFilters keys={["q", "status", "severity"]} storageKey="investigations" />
        </div>
      </Suspense>

      {localizedResult.items.length === 0 ? (
        <EmptyState
          icon={<Radar />}
          title={c("No investigations match")}
          description={c("Create one from an alert, or start an empty case.")}
        />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <SortTh label={c("Investigation")} column="title" {...sorting} />
              <SortTh label={c("Severity")} column="severity" className="w-28" {...sorting} />
              <SortTh label={c("Status")} column="status" className="w-32" {...sorting} />
              <TH className="w-40">{c("Lead")}</TH>
              <TH className="w-20 text-right">{c("Alerts")}</TH>
              <TH className="w-20 text-right">{c("Notes")}</TH>
              <SortTh
                label={c("Updated")}
                column="updated_at"
                defaultOrder="desc"
                className="w-28 text-right"
                {...sorting}
              />
            </TR>
          </THead>
          <TBody>
            {localizedResult.items.map((inv) => (
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
                    <span className="text-xs text-muted-foreground">{c("No lead")}</span>
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
        page={localizedResult.page}
        pages={localizedResult.pages}
        total={localizedResult.total}
        pageSize={localizedResult.page_size}
        path="/soc/investigations"
        params={sp}
        noun="investigations"
      />
    </>
  );
}
