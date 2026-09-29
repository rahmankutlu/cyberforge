import { TH, cn } from "@cyberforge/ui";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import Link from "next/link";

import { hrefWith, type SearchParams } from "@/lib/params";

/**
 * A sortable table header rendered as a plain link, so sorting works server-side (and without
 * client JavaScript). Sort state lives in the URL: `?sort=timestamp&order=desc`.
 */
export function SortTh({
  label,
  column,
  sort,
  order,
  path,
  params,
  className,
  defaultOrder = "asc",
}: {
  label: string;
  column: string;
  sort: string;
  order: "asc" | "desc";
  path: string;
  params: SearchParams;
  className?: string;
  defaultOrder?: "asc" | "desc";
}) {
  const active = sort === column;
  const nextOrder = active ? (order === "asc" ? "desc" : "asc") : defaultOrder;
  const Icon = !active ? ChevronsUpDown : order === "asc" ? ArrowUp : ArrowDown;

  return (
    <TH
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
      className={className}
    >
      <Link
        href={hrefWith(path, params, { sort: column, order: nextOrder })}
        scroll={false}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon className={cn("size-3", !active && "opacity-40")} aria-hidden />
      </Link>
    </TH>
  );
}
