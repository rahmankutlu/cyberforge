import type { EventFacets, EventSummary, Page } from "@cyberforge/types";
import { Suspense } from "react";

import { Pagination } from "@/components/data/pagination";
import { ClearFilters, PersistFilters, UrlSearch, UrlSelect } from "@/components/data/url-filters";
import { PageHeader } from "@/components/page-header";
import { EventsTable } from "@/components/soc/events-table";
import { apiGet } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { first, positiveInt, type SearchParams } from "@/lib/params";

export const metadata = { title: "Events" };

const PAGE_SIZE = 30;

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = positiveInt(sp.page, 1);
  const sort = first(sp.sort) ?? "timestamp";
  const order = first(sp.order) === "asc" ? "asc" : "desc";

  const [result, facets] = await Promise.all([
    apiGet<Page<EventSummary>>("/events", {
      page,
      page_size: PAGE_SIZE,
      sort,
      order,
      q: first(sp.q),
      category: first(sp.category),
      source: first(sp.source),
      outcome: first(sp.outcome),
      host: first(sp.host),
    }),
    apiGet<EventFacets>("/events/facets"),
  ]);
  const opts = (values: { value: string; count: number }[]) =>
    values.map((f) => ({ value: f.value, label: `${f.value} (${formatNumber(f.count)})` }));

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Mini SOC", href: "/soc" }, { label: "Events" }]}
        title="Events"
        description="Normalised telemetry from seeded datasets, simulated labs and local lab containers. Expand a row to see the raw log line and the parsed fields."
      />
      <Suspense>
        <PersistFilters storageKey="events" />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <UrlSearch
            placeholder="Search message, host, user, IP, raw…"
            className="w-full sm:w-80"
            label="Search events"
          />
          <UrlSelect param="source" label="Source" options={opts(facets.source)} className="w-52" />
          <UrlSelect
            param="category"
            label="Category"
            options={opts(facets.category)}
            className="w-56"
          />
          <UrlSelect
            param="outcome"
            label="Outcome"
            options={opts(facets.outcome)}
            className="w-48"
          />
          <UrlSelect param="host" label="Host" options={opts(facets.host)} className="w-52" />
          <ClearFilters keys={["q", "source", "category", "outcome", "host"]} storageKey="events" />
        </div>
      </Suspense>
      <EventsTable
        events={result.items}
        sorting={{ path: "/soc/events", params: sp, sort, order }}
      />
      <Pagination
        page={result.page}
        pages={result.pages}
        total={result.total}
        pageSize={result.page_size}
        path="/soc/events"
        params={sp}
        noun="events"
      />
    </>
  );
}
