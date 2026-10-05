import type { Page, QualityResponse, RuleSummary } from "@cyberforge/types";
import { SEVERITIES } from "@cyberforge/types";
import { Badge, Button, EmptyState, Table, TBody, TD, TH, THead, TR } from "@cyberforge/ui";
import { Crosshair, FlaskConical, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { FormatBadge, SeverityBadge, TechniqueChip } from "@/components/badges";
import { Pagination } from "@/components/data/pagination";
import { SortTh } from "@/components/data/sort-th";
import {
  ClearFilters,
  PersistFilters,
  UrlChips,
  UrlSearch,
  UrlSelect,
} from "@/components/data/url-filters";
import { QualityBadge } from "@/components/detections/rule-quality";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";
import { SEVERITY_LABEL, titleCase } from "@/lib/format";
import { all, first, positiveInt, type SearchParams } from "@/lib/params";
import { createCopyTranslator, localizeKnownCopy } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { localizeContent } from "@/lib/i18n/content";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("Detections") };
}
const PAGE_SIZE = 20;

export default async function DetectionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const sp = await searchParams;
  const sort = first(sp.sort) ?? "title";
  const order = first(sp.order) === "desc" ? "desc" : "asc";
  const format = first(sp.format);
  const result = await apiGet<Page<RuleSummary>>("/detections", {
    page: positiveInt(sp.page, 1),
    page_size: PAGE_SIZE,
    sort,
    order,
    q: first(sp.q),
    technique: first(sp.technique),
    format: format === "sigma" || format === "yara" || format === "suricata" ? format : undefined,
    level: all(sp.level),
    origin: first(sp.origin) === "user" ? "user" : undefined,
  });
  const sorting = { path: "/detections", params: sp, sort, order } as const;
  const quality = await apiGet<QualityResponse>("/detections/quality");
  const qualityBySlug = new Map(quality.rules.map((q) => [q.slug, q] as const));
  const { coverage } = quality;

  return (
    <>
      <PageHeader
        title={c("Detection workbench")}
        description={c(
          "Sigma, YARA and Suricata rules mapped to MITRE ATT&CK. Every rule documents what it detects, how it can misfire and which lab exercises it.",
        )}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/detections/playground">
                <FlaskConical /> {c("Playground")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/detections/new" data-testid="new-rule">
                <Plus /> {c("New rule")}
              </Link>
            </Button>
          </>
        }
      />
      <p
        className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 text-xs"
        data-testid="coverage-summary"
      >
        <span className="font-medium">{c("Detection test coverage")}</span>
        <span className="text-muted-foreground">
          {c("{{tested}} of {{rules}} Sigma rules tested ({{percent}}%)", {
            tested: coverage.tested,
            rules: coverage.rules,
            percent: coverage.percent,
          })}
        </span>
        <span className="text-muted-foreground">
          {c(
            coverage.failing === 0
              ? "{{tests}} tests, all passing"
              : "{{tests}} tests, {{failing}} failing",
            { tests: coverage.tests, failing: coverage.failing },
          )}
        </span>
        <span className="text-muted-foreground">
          {c("{{passed}} of {{total}} quality checks passed", {
            passed: quality.checks_passed,
            total: quality.checks_total,
          })}
        </span>
      </p>
      <Suspense>
        <PersistFilters storageKey="detections" />
        <div className="mb-4 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <UrlSearch
              placeholder={c("Search rules…")}
              className="w-full sm:w-72"
              label={c("Search rules")}
            />
            <UrlSearch
              param="technique"
              placeholder={c("MITRE technique, e.g. T1059")}
              className="w-full sm:w-56"
              label={c("Filter by MITRE technique")}
            />
            <UrlSelect
              param="format"
              label={c("Format")}
              options={["sigma", "yara", "suricata"].map((f) => ({
                value: f,
                label: titleCase(f),
              }))}
              className="w-44"
            />
            <UrlSelect
              param="origin"
              label={c("Origin")}
              options={[{ value: "user", label: c("My rules") }]}
              className="w-40"
            />
            <ClearFilters
              keys={["q", "technique", "format", "origin", "level"]}
              storageKey="detections"
            />
          </div>
          <UrlChips
            param="level"
            label={c("Level")}
            options={SEVERITIES.map((s) => ({
              value: s,
              label: localizeKnownCopy(locale, SEVERITY_LABEL[s]),
            }))}
          />
        </div>
      </Suspense>

      {result.items.length === 0 ? (
        <EmptyState
          icon={<Crosshair />}
          title={c("No rules match")}
          description={c("Clear the filters, or write a new rule.")}
        />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <SortTh label={c("Rule")} column="title" {...sorting} />
              <SortTh label={c("Format")} column="format" className="w-24" {...sorting} />
              <SortTh label={c("Level")} column="level" className="w-28" {...sorting} />
              <TH>MITRE</TH>
              <TH className="w-20">{c("Checks")}</TH>
              <TH className="w-16 text-right">{c("Labs")}</TH>
              <TH className="w-16 text-right">{c("Alerts")}</TH>
              <SortTh label={c("Status")} column="status" className="w-28" {...sorting} />
            </TR>
          </THead>
          <TBody>
            {result.items.map((rule) => (
              <TR key={rule.id} data-testid="rule-row">
                <TD className="max-w-md">
                  <Link
                    href={`/detections/${rule.slug}`}
                    className="block truncate rounded font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {localizeContent(locale, rule.title)}
                  </Link>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[11px] text-muted-foreground">
                    {rule.slug}
                    {rule.is_correlation ? (
                      <Badge variant="accent" className="py-0 font-sans">
                        {c("correlation")}
                      </Badge>
                    ) : null}
                    {rule.origin === "user" ? (
                      <Badge variant="outline" className="py-0 font-sans">
                        {c("yours")}
                      </Badge>
                    ) : null}
                    {rule.enabled ? null : (
                      <Badge variant="warning" className="py-0 font-sans">
                        {c("disabled")}
                      </Badge>
                    )}
                  </p>
                </TD>
                <TD>
                  <FormatBadge format={rule.format} />
                </TD>
                <TD>
                  <SeverityBadge severity={rule.level} />
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {rule.techniques.slice(0, 2).map((t) => (
                      <TechniqueChip key={t.id} id={t.id} />
                    ))}
                    {rule.techniques.length > 2 ? (
                      <span className="text-[11px] text-muted-foreground">
                        +{rule.techniques.length - 2}
                      </span>
                    ) : null}
                    {rule.techniques.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : null}
                  </div>
                </TD>
                <TD>
                  <QualityBadge quality={qualityBySlug.get(rule.slug)} />
                </TD>
                <TD className="text-right tabular-nums">{rule.lab_count}</TD>
                <TD className="text-right tabular-nums">{rule.alert_count}</TD>
                <TD className="text-xs capitalize text-muted-foreground">
                  {localizeKnownCopy(locale, titleCase(rule.status))}
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
        path="/detections"
        params={sp}
        noun="rules"
      />
    </>
  );
}
