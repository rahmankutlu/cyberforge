"use client";

import type { AlertSummary } from "@cyberforge/types";
import { EmptyState, Table, TBody, TD, TH, THead, TR } from "@cyberforge/ui";
import { ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";

import {
  AlertStatusBadge,
  SeverityBadge,
  SyntheticBadge,
  TechniqueChip,
} from "@/components/badges";
import { SortTh } from "@/components/data/sort-th";
import { RelativeTime } from "@/components/relative-time";
import type { SearchParams } from "@/lib/params";
import { useLocale } from "@/components/i18n/locale-provider";

export interface AlertsSort {
  path: string;
  params: SearchParams;
  sort: string;
  order: "asc" | "desc";
}

export function AlertsTable({
  alerts,
  sorting,
  compact = false,
  showSynthetic = false,
  emptyTitle,
  emptyDescription,
}: {
  alerts: AlertSummary[];
  sorting?: AlertsSort;
  compact?: boolean;
  showSynthetic?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const { t } = useLocale();
  const resolvedEmptyTitle = emptyTitle ?? t("alerts.noMatch");
  const resolvedEmptyDescription = emptyDescription ?? t("alerts.emptyDescription");
  if (alerts.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck />}
        title={resolvedEmptyTitle}
        description={resolvedEmptyDescription}
      />
    );
  }

  const head = (
    label: string,
    column: string,
    className?: string,
    defaultOrder: "asc" | "desc" = "asc",
  ) =>
    sorting ? (
      <SortTh
        label={label}
        column={column}
        className={className}
        defaultOrder={defaultOrder}
        {...sorting}
      />
    ) : (
      <TH className={className}>{label}</TH>
    );

  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          {head(t("alerts.severity"), "severity", "w-28")}
          {head(t("alerts.alert"), "title")}
          {compact ? null : head(t("alerts.hostUser"), "host")}
          {compact ? null : head(t("alerts.technique"), "technique")}
          {head(t("alerts.status"), "status", "w-32")}
          {compact ? null : <TH className="w-36">{t("alerts.assignee")}</TH>}
          {head(t("alerts.when"), "timestamp", "w-28 text-right", "desc")}
        </TR>
      </THead>
      <TBody>
        {alerts.map((alert) => (
          <TR key={alert.id} data-testid="alert-row">
            <TD>
              <SeverityBadge severity={alert.severity} />
            </TD>
            <TD className="max-w-[28rem]">
              <Link
                href={`/soc/alerts/${alert.id}`}
                className="block truncate rounded font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
              >
                {alert.title}
              </Link>
              <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                <span className="font-mono">#{alert.id}</span>
                {alert.rule ? <span className="truncate">· {alert.rule.slug}</span> : null}
                {showSynthetic && alert.synthetic ? <SyntheticBadge className="ml-1 py-0" /> : null}
              </p>
            </TD>
            {compact ? null : (
              <TD className="max-w-48">
                <p className="truncate font-mono text-xs">{alert.host ?? "—"}</p>
                <p className="truncate text-[11px] text-muted-foreground">{alert.user ?? ""}</p>
              </TD>
            )}
            {compact ? null : (
              <TD className="max-w-56">
                {alert.technique ? (
                  <TechniqueChip
                    id={alert.technique.id}
                    name={alert.technique.name}
                    className="max-w-full"
                  />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TD>
            )}
            <TD>
              <AlertStatusBadge status={alert.status} />
            </TD>
            {compact ? null : (
              <TD>
                {alert.assignee ? (
                  <span className="flex items-center gap-1.5 text-xs">
                    <UserRound className="size-3 text-muted-foreground" />
                    {alert.assignee.name}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{t("alerts.unassigned")}</span>
                )}
              </TD>
            )}
            <TD className="text-right text-xs text-muted-foreground">
              <RelativeTime iso={alert.timestamp} />
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
