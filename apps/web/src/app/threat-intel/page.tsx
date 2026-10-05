import type { Indicator, IndicatorDetail, Page } from "@cyberforge/types";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Progress,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  cn,
} from "@cyberforge/ui";
import { Lock, Target } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { SyntheticBadge } from "@/components/badges";
import { CopyButton } from "@/components/code-block";
import { Pagination } from "@/components/data/pagination";
import { SortTh } from "@/components/data/sort-th";
import { ClearFilters, PersistFilters, UrlSearch, UrlSelect } from "@/components/data/url-filters";
import { ImportIndicatorDialog } from "@/components/intel/import-indicator-dialog";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { AlertsTable } from "@/components/soc/alerts-table";
import { apiGet, apiGetOrNull } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { first, hrefWith, positiveInt, type SearchParams } from "@/lib/params";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { localizeContentTree } from "@/lib/i18n/content";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("Threat intelligence") };
}
const PAGE_SIZE = 15;
const TYPES = ["ip", "domain", "url", "sha256", "email", "cve", "asn"];

export default async function ThreatIntelPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const sp = await searchParams;
  const sort = first(sp.sort) ?? "last_seen";
  const order = first(sp.order) === "asc" ? "asc" : "desc";
  const type = first(sp.type);
  const sourceResult = await apiGet<Page<Indicator>>("/indicators", {
    page: positiveInt(sp.page, 1),
    page_size: PAGE_SIZE,
    sort,
    order,
    q: first(sp.q),
    tag: first(sp.tag),
    type: type && TYPES.includes(type) ? type : undefined,
  });
  const selectedId = Number.parseInt(first(sp.selected) ?? "", 10);
  const sourceSelected = Number.isFinite(selectedId)
    ? await apiGetOrNull<IndicatorDetail>(`/indicators/${selectedId}`)
    : null;
  const result = localizeContentTree(locale, sourceResult);
  const selected = localizeContentTree(locale, sourceSelected);
  const sorting = { path: "/threat-intel", params: sp, sort, order } as const;

  return (
    <>
      <PageHeader
        title={c("Threat intelligence")}
        description={c(
          "A small local workspace for indicators: seeded synthetic examples, plus anything you import. Indicators are matched against your own telemetry locally.",
        )}
        actions={<ImportIndicatorDialog />}
        meta={
          <Badge variant="outline" className="gap-1">
            <Lock className="size-3" />{" "}
            {c("No automatic enrichment: your telemetry is never sent to third parties")}
          </Badge>
        }
      />
      <Suspense>
        <PersistFilters storageKey="intel" />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <UrlSearch
            placeholder={c("Search value, notes, source…")}
            className="w-full sm:w-72"
            label={c("Search indicators")}
          />
          <UrlSelect
            param="type"
            label={c("Type")}
            options={TYPES.map((t) => ({ value: t, label: t }))}
            className="w-40"
          />
          <UrlSearch
            param="tag"
            placeholder={c("Tag, e.g. dns-tunnel")}
            className="w-full sm:w-44"
            label={c("Filter by tag")}
          />
          <ClearFilters keys={["q", "type", "tag"]} storageKey="intel" />
        </div>
      </Suspense>

      <div className={cn("grid gap-4", selected && "xl:grid-cols-[minmax(0,1fr)_24rem]")}>
        <div className="min-w-0">
          {result.items.length === 0 ? (
            <EmptyState
              icon={<Target />}
              title={c("No indicators match")}
              description={c("Import one manually or clear the filters.")}
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <SortTh label={c("Type")} column="type" className="w-20" {...sorting} />
                  <SortTh label={c("Indicator")} column="value" {...sorting} />
                  <SortTh
                    label={c("Confidence")}
                    column="confidence"
                    className="w-36"
                    defaultOrder="desc"
                    {...sorting}
                  />
                  <TH>{c("Tags")}</TH>
                  <TH className="w-28">{c("Source")}</TH>
                  <SortTh
                    label={c("Last seen")}
                    column="last_seen"
                    className="w-28 text-right"
                    defaultOrder="desc"
                    {...sorting}
                  />
                </TR>
              </THead>
              <TBody>
                {result.items.map((ind) => (
                  <TR
                    key={ind.id}
                    data-testid="indicator-row"
                    className={cn(selected?.id === ind.id && "bg-primary/8")}
                  >
                    <TD>
                      <Badge variant="outline" className="font-mono uppercase">
                        {ind.type}
                      </Badge>
                    </TD>
                    <TD className="max-w-xs">
                      <Link
                        href={hrefWith("/threat-intel", sp, { selected: String(ind.id) })}
                        scroll={false}
                        className="block truncate rounded font-mono text-xs outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {ind.value}
                      </Link>
                      {ind.synthetic ? null : (
                        <Badge variant="success" className="mt-0.5 py-0">
                          {c("imported")}
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={ind.confidence}
                          className="w-16"
                          label={`${c("Confidence")} ${ind.confidence}`}
                        />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {ind.confidence}
                        </span>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {ind.tags.slice(0, 3).map((t) => (
                          <Badge key={t} variant="neutral">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </TD>
                    <TD className="max-w-28 truncate text-xs text-muted-foreground">
                      {ind.source}
                    </TD>
                    <TD className="text-right text-xs text-muted-foreground">
                      <RelativeTime iso={ind.last_seen} />
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
            path="/threat-intel"
            params={sp}
            noun="indicators"
          />
        </div>

        {selected ? (
          <Card className="h-fit xl:sticky xl:top-20" data-testid="indicator-detail">
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle className="break-all font-mono text-[13px]">{selected.value}</CardTitle>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="font-mono uppercase">
                    {selected.type}
                  </Badge>
                  <Badge variant="outline">TLP:{selected.tlp.toUpperCase()}</Badge>
                  {selected.synthetic ? <SyntheticBadge /> : null}
                </div>
              </div>
              <CopyButton text={selected.value} />
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">{c("Confidence")}</dt>
                  <dd className="tabular-nums">{selected.confidence}/100</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{c("Source")}</dt>
                  <dd>{selected.source}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{c("First seen")}</dt>
                  <dd>{formatDate(selected.first_seen, locale)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{c("Last seen")}</dt>
                  <dd>{formatDate(selected.last_seen, locale)}</dd>
                </div>
              </dl>
              {selected.tags.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {selected.tags.map((t) => (
                    <Badge key={t} variant="neutral">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {selected.notes ? (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {selected.notes}
                </p>
              ) : null}
              <div>
                <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  {c("Related alerts")} ({selected.related_alerts.length})
                </h3>
                {selected.related_alerts.length ? (
                  <AlertsTable alerts={selected.related_alerts} compact />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {c("No local alerts mention this indicator.")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
