"use client";

import type { EventSummary, SecurityEvent } from "@cyberforge/types";
import { Badge, EmptyState, Skeleton, Table, TBody, TD, TH, THead, TR, cn } from "@cyberforge/ui";
import { useQuery } from "@tanstack/react-query";
import { Activity, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";

import { SortTh } from "@/components/data/sort-th";
import { apiGet } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { SearchParams } from "@/lib/params";
import { useLocale } from "@/components/i18n/locale-provider";

function EventDetails({ id }: { id: number }) {
  const { c } = useLocale();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["event", id],
    queryFn: () => apiGet<SecurityEvent>(`/events/${id}`),
  });
  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (isError || !data)
    return <p className="text-xs text-sev-high">{c("Could not load this event.")}</p>;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {c("Raw")}
        </p>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 p-2.5 font-mono text-[11px] leading-5">
          {data.raw}
        </pre>
        {data.note ? <p className="mt-2 text-xs text-muted-foreground">{data.note}</p> : null}
      </div>
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {c("Parsed fields")}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md border border-border p-2.5 text-[11px]">
          {Object.entries(data.fields).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="break-all font-mono">
                {typeof v === "string" ? v : JSON.stringify(v)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

export function EventsTable({
  events,
  sorting,
}: {
  events: EventSummary[];
  sorting: { path: string; params: SearchParams; sort: string; order: "asc" | "desc" };
}) {
  const [open, setOpen] = useState<number | null>(null);
  const { c, locale } = useLocale();
  if (events.length === 0) {
    return (
      <EmptyState
        icon={<Activity />}
        title={c("No events match")}
        description={c("Adjust the filters, or run a lab to generate telemetry.")}
      />
    );
  }
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <TH className="w-8">
            <span className="sr-only">{c("Expand")}</span>
          </TH>
          <SortTh
            label={c("Time")}
            column="timestamp"
            defaultOrder="desc"
            className="w-40"
            {...sorting}
          />
          <SortTh label={c("Source")} column="source" className="w-32" {...sorting} />
          <SortTh label={c("Host")} column="host" className="w-36" {...sorting} />
          <SortTh label={c("User")} column="user" className="w-36" {...sorting} />
          <TH>{c("Event")}</TH>
          <SortTh label={c("Outcome")} column="outcome" className="w-24" {...sorting} />
        </TR>
      </THead>
      <TBody>
        {events.map((e) => {
          const expanded = open === e.id;
          return (
            <Fragment key={e.id}>
              <TR data-testid="event-row" className={cn(expanded && "bg-muted/30")}>
                <TD className="pr-0">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-label={expanded ? c("Hide raw event") : c("Show raw event")}
                    onClick={() => setOpen(expanded ? null : e.id)}
                    className="rounded p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ChevronRight
                      className={cn("size-3.5 transition-transform", expanded && "rotate-90")}
                    />
                  </button>
                </TD>
                <TD className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {formatDateTime(e.timestamp, locale)}
                </TD>
                <TD>
                  <Badge variant="outline" className="font-mono">
                    {e.source}
                  </Badge>
                </TD>
                <TD className="max-w-36 truncate font-mono text-xs">{e.host ?? "—"}</TD>
                <TD className="max-w-36 truncate text-xs">{e.user ?? "—"}</TD>
                <TD className="max-w-[34rem]">
                  <p className="flex items-center gap-1.5 truncate text-xs">
                    {e.synthetic ? null : (
                      <Badge
                        variant="success"
                        title={c("Received from a local lab container, not synthetic")}
                      >
                        {c("live")}
                      </Badge>
                    )}
                    <span className="truncate">{e.message}</span>
                  </p>
                </TD>
                <TD>
                  {e.outcome ? (
                    <Badge
                      variant={
                        e.outcome === "failure"
                          ? "high"
                          : e.outcome === "blocked"
                            ? "medium"
                            : e.outcome === "success" || e.outcome === "allowed"
                              ? "success"
                              : "neutral"
                      }
                    >
                      {e.outcome}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TD>
              </TR>
              {expanded ? (
                <tr className="border-b border-border/70 bg-muted/20">
                  <td colSpan={7} className="px-4 py-3">
                    <EventDetails id={e.id} />
                  </td>
                </tr>
              ) : null}
            </Fragment>
          );
        })}
      </TBody>
    </Table>
  );
}
