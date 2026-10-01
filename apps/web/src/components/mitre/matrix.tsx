import type { Matrix, TechniqueCoverage } from "@cyberforge/types";
import { cn } from "@cyberforge/ui";
import Link from "next/link";

import { heatBackground, heatLevel, metricValue, nestTechniques, type Metric } from "@/lib/mitre";

function Cell({ t, metric, depth = 0 }: { t: TechniqueCoverage; metric: Metric; depth?: number }) {
  const count = metricValue(t, metric);
  const level = heatLevel(count);
  return (
    <Link
      href={`/mitre/${t.id}`}
      data-technique={t.id}
      data-level={level}
      style={{ background: heatBackground(count) }}
      title={`${t.id} ${t.name}\nRules: ${t.rules} · Labs: ${t.labs} · Alerts: ${t.alerts} · Investigations: ${t.investigations}`}
      className={cn(
        "group block rounded border px-1.5 py-1 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        level === 0
          ? "border-border/70 text-muted-foreground hover:border-primary/40 hover:text-foreground"
          : "border-primary/25 text-foreground hover:border-primary/60",
        depth > 0 && "ml-2.5",
      )}
    >
      <span className="flex items-baseline justify-between gap-1.5">
        <span className="font-mono text-[10px]">{t.id}</span>
        {count > 0 ? <span className="font-mono text-[10px] tabular-nums">{count}</span> : null}
      </span>
      <span className="line-clamp-2 text-[11px] leading-tight">{t.name}</span>
    </Link>
  );
}

/** Server-rendered coverage heatmap: one column per tactic, one cell per technique. */
export function MatrixView({
  matrix,
  metric,
  showSub,
}: {
  matrix: Matrix;
  metric: Metric;
  showSub: boolean;
}) {
  return (
    <div className="overflow-x-auto pb-2" data-testid="matrix">
      <div className="flex min-w-max gap-2">
        {matrix.columns.map(({ tactic, techniques }) => {
          const nested = nestTechniques(techniques);
          const covered = nested.filter(({ parent }) => parent.rules > 0).length;
          return (
            <section key={tactic.id} aria-label={tactic.name} className="w-44 shrink-0">
              <header className="mb-1.5 rounded-md border border-border bg-card px-2 py-1.5">
                <h3 className="text-xs font-semibold">{tactic.name}</h3>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {tactic.id} · {covered}/{nested.length} covered
                </p>
              </header>
              <div className="space-y-1">
                {nested.map(({ parent, children }) => (
                  <div key={parent.id} className="space-y-1">
                    <Cell t={parent} metric={metric} />
                    {showSub
                      ? children.map((c) => <Cell key={c.id} t={c} metric={metric} depth={1} />)
                      : null}
                  </div>
                ))}
                {nested.length === 0 ? (
                  <p className="px-1 text-[11px] text-muted-foreground">No curated techniques.</p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export function MatrixLegend({ metricLabel }: { metricLabel: string }) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
      aria-label="Legend"
    >
      <span>{metricLabel}:</span>
      {[0, 1, 2, 3, 5].map((n) => (
        <span key={n} className="flex items-center gap-1">
          <span
            className="inline-block size-3.5 rounded border border-border"
            style={{ background: heatBackground(n) }}
          />
          {n === 0 ? "none" : n === 5 ? "5+" : n === 3 ? "3–4" : n}
        </span>
      ))}
    </div>
  );
}
