import { Button, cn } from "@cyberforge/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { formatNumber } from "@/lib/format";
import { hrefWith, type SearchParams } from "@/lib/params";

export function pageWindow(page: number, pages: number, span = 2): (number | "gap")[] {
  const out: (number | "gap")[] = [];
  let last = 0;
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= span) {
      if (last && p - last > 1) out.push("gap");
      out.push(p);
      last = p;
    }
  }
  return out;
}

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  path,
  params,
  noun = "results",
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  path: string;
  params: SearchParams;
  noun?: string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => hrefWith(path, params, { page: p === 1 ? null : p });

  return (
    <nav
      aria-label="Pagination"
      className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
    >
      <p>
        {total === 0
          ? `No ${noun}`
          : `${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)} ${noun}`}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-1">
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn(page <= 1 && "pointer-events-none opacity-40")}
            aria-disabled={page <= 1}
          >
            <Link
              href={href(Math.max(1, page - 1))}
              scroll={false}
              aria-label="Previous page"
              tabIndex={page <= 1 ? -1 : undefined}
            >
              <ChevronLeft />
            </Link>
          </Button>
          {pageWindow(page, pages).map((p, i) =>
            p === "gap" ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <Button
                key={p}
                asChild
                variant={p === page ? "secondary" : "ghost"}
                size="sm"
                className="min-w-7 px-1.5"
              >
                <Link
                  href={href(p)}
                  scroll={false}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Page ${p}`}
                >
                  {p}
                </Link>
              </Button>
            ),
          )}
          <Button
            asChild
            variant="outline"
            size="sm"
            className={cn(page >= pages && "pointer-events-none opacity-40")}
            aria-disabled={page >= pages}
          >
            <Link
              href={href(Math.min(pages, page + 1))}
              scroll={false}
              aria-label="Next page"
              tabIndex={page >= pages ? -1 : undefined}
            >
              <ChevronRight />
            </Link>
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
