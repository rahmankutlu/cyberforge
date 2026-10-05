import type { Analyst, AlertStats, AlertSummary, Page, TechniqueCoverage } from "@cyberforge/types";
import { ALERT_STATUSES, SEVERITIES } from "@cyberforge/types";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { Pagination } from "@/components/data/pagination";
import {
  ClearFilters,
  PersistFilters,
  UrlChips,
  UrlSearch,
  UrlSelect,
} from "@/components/data/url-filters";
import { AlertsTable } from "@/components/soc/alerts-table";
import { apiGet } from "@/lib/api";
import { all, first, positiveInt, type SearchParams } from "@/lib/params";
import { createTranslator } from "@/lib/i18n";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { localizeContentTree } from "@/lib/i18n/content";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("Alerts") };
}

const PAGE_SIZE = 20;

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const t = createTranslator(locale);
  const sp = await searchParams;
  const page = positiveInt(sp.page, 1);
  const sort = first(sp.sort) ?? "timestamp";
  const order = first(sp.order) === "asc" ? "asc" : "desc";

  const [result, stats, analysts, techniques] = await Promise.all([
    apiGet<Page<AlertSummary>>("/alerts", {
      page,
      page_size: PAGE_SIZE,
      sort,
      order,
      q: first(sp.q),
      technique: first(sp.technique),
      assignee: first(sp.assignee),
      severity: all(sp.severity),
      status: all(sp.status),
    }),
    apiGet<AlertStats>("/alerts/stats"),
    apiGet<Analyst[]>("/analysts"),
    apiGet<TechniqueCoverage[]>("/mitre/techniques", { framework: "attack", covered: true }),
  ]);
  const localizedResult = localizeContentTree(locale, result);

  const technique = first(sp.technique);
  const chipClasses = {
    critical: "border-sev-critical/50 bg-sev-critical/12",
    high: "border-sev-high/50 bg-sev-high/12",
    medium: "border-sev-medium/50 bg-sev-medium/12",
  };
  const severityLabels = {
    critical: t("severity.critical"),
    high: t("severity.high"),
    medium: t("severity.medium"),
    low: t("severity.low"),
    informational: t("severity.informational"),
  };
  const statusLabels = {
    new: t("alertStatus.new"),
    investigating: t("alertStatus.investigating"),
    contained: t("alertStatus.contained"),
    resolved: t("alertStatus.resolved"),
    false_positive: t("alertStatus.falsePositive"),
  };

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: c("Mini SOC"), href: "/soc" }, { label: c("Alerts") }]}
        title={c("Alerts")}
        description={c(
          "{{open}} open of {{total}} total. Filters are kept in the URL and remembered for your next visit.",
          { open: stats.open, total: stats.total },
        )}
      />

      <Suspense>
        <PersistFilters storageKey="alerts" />
        <div className="mb-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <UrlSearch
              placeholder={c("Search title, host, user…")}
              className="w-full sm:w-72"
              label={c("Search alerts")}
            />
            <UrlSearch
              param="technique"
              placeholder={c("MITRE technique, e.g. T1059")}
              className="w-full sm:w-56"
              label={c("Filter by MITRE technique")}
            />
            <UrlSelect
              param="assignee"
              label={c("Assignee")}
              allLabel={c("Anyone")}
              options={[
                { value: "unassigned", label: c("Unassigned") },
                ...analysts.map((a) => ({ value: String(a.id), label: a.name })),
              ]}
              className="w-52"
            />
            <ClearFilters
              keys={["q", "technique", "assignee", "severity", "status"]}
              storageKey="alerts"
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <UrlChips
              param="severity"
              label={c("Severity")}
              options={SEVERITIES.map((s) => ({
                value: s,
                label: `${severityLabels[s]} ${stats.by_severity[s] ?? 0}`,
              }))}
              colorClasses={chipClasses}
            />
            <UrlChips
              param="status"
              label={c("Status")}
              options={ALERT_STATUSES.map((s) => ({
                value: s,
                label: `${statusLabels[s]} ${stats.by_status[s] ?? 0}`,
              }))}
            />
          </div>
          {technique &&
          !techniques.some((t) => t.id === technique || technique.startsWith(`${t.id}.`)) ? (
            <p className="text-xs text-muted-foreground">
              {c("Tip: technique filters accept a parent (T1059) to include its sub-techniques.")}
            </p>
          ) : null}
        </div>
      </Suspense>

      <AlertsTable
        alerts={localizedResult.items}
        sorting={{ path: "/soc/alerts", params: sp, sort, order }}
        showSynthetic
      />
      <Pagination
        page={localizedResult.page}
        pages={localizedResult.pages}
        total={localizedResult.total}
        pageSize={localizedResult.page_size}
        path="/soc/alerts"
        params={sp}
        noun="alerts"
      />
    </>
  );
}
