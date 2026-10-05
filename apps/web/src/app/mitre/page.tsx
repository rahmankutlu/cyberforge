import type { Matrix, TechniqueCoverage } from "@cyberforge/types";
import {
  Badge,
  Card,
  CardContent,
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
import { Grid3x3 } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { TechniqueChip } from "@/components/badges";
import { SortTh } from "@/components/data/sort-th";
import { ClearFilters, UrlSearch, UrlSelect } from "@/components/data/url-filters";
import { MatrixLegend, MatrixView } from "@/components/mitre/matrix";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { apiGet } from "@/lib/api";
import {
  DOMAINS,
  METRICS,
  contentCoverage,
  coverageSummary,
  isDomain,
  type Metric,
} from "@/lib/mitre";
import { first, hrefWith, type SearchParams } from "@/lib/params";
import { createCopyTranslator, localizeKnownCopy, type CopyTranslate } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("MITRE ATT&CK explorer") };
}

const VIEWS = [
  { value: "matrix", label: "Coverage map" },
  { value: "coverage", label: "Detection coverage" },
  { value: "content", label: "Content coverage" },
  { value: "techniques", label: "Techniques" },
  { value: "tactics", label: "Tactics" },
] as const;
type View = (typeof VIEWS)[number]["value"];

export default async function MitrePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const sp = await searchParams;
  const view: View = VIEWS.some((v) => v.value === first(sp.view))
    ? (first(sp.view) as View)
    : "matrix";
  const framework = first(sp.fw) === "atlas" ? "atlas" : "attack";
  const metric: Metric = METRICS.some((m) => m.value === first(sp.metric))
    ? (first(sp.metric) as Metric)
    : "rules";
  const showSub = first(sp.sub) === "1";
  const domain = isDomain(first(sp.domain))
    ? (first(sp.domain) as (typeof DOMAINS)[number])
    : undefined;

  const [matrix, techniques] = await Promise.all([
    apiGet<Matrix>("/mitre/matrix", { framework, domain }),
    apiGet<TechniqueCoverage[]>("/mitre/techniques", {
      framework,
      domain,
      lacking_tests: first(sp.tests) === "lacking" ? true : undefined,
      tactic: first(sp.tactic),
      q: first(sp.q),
      covered: first(sp.covered) === "yes" ? true : first(sp.covered) === "no" ? false : undefined,
    }),
  ]);
  const allTechniques = matrix.columns.flatMap((c) => c.techniques);
  const unique = [...new Map(allTechniques.map((t) => [t.id, t])).values()];
  const summary = coverageSummary(unique);
  const metricInfo = METRICS.find((m) => m.value === metric)!;
  const link = (updates: Record<string, string | null>) => hrefWith("/mitre", sp, updates);

  const tabClass = (on: boolean) =>
    cn(
      "rounded-md px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
      on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <>
      <PageHeader
        title={c("MITRE ATT&CK explorer")}
        description={
          locale === "tr"
            ? `CyberForge laboratuvarlarının, kurallarının ve uyarılarının hangi teknikleri kapsadığını görün. ${framework === "attack" ? `ATT&CK Enterprise v${matrix.version}` : `ATLAS v${matrix.version} (Yapay zekâ sistemleri)`} · tanımlayıcılar doğrudan MITRE verilerinden gelir.`
            : `See which techniques CyberForge's labs, rules and alerts cover. ${framework === "attack" ? `ATT&CK Enterprise v${matrix.version}` : `ATLAS v${matrix.version} (AI systems)`} · identifiers come straight from MITRE's data.`
        }
        actions={
          <div
            className="inline-flex rounded-md border border-border bg-muted/50 p-0.5"
            role="group"
            aria-label={c("Framework")}
          >
            {(["attack", "atlas"] as const).map((fw) => (
              <Link
                key={fw}
                href={link({
                  fw: fw === "attack" ? null : fw,
                  tactic: null,
                  q: null,
                  covered: null,
                })}
                aria-current={framework === fw ? "true" : undefined}
                className={tabClass(framework === fw)}
              >
                {fw === "attack" ? "ATT&CK" : "ATLAS (AI)"}
              </Link>
            ))}
          </div>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label={c("Techniques (top-level)")}
          value={summary.total}
          hint={c("Curated subset mapped by CyberForge")}
        />
        <StatCard
          label={c("With a detection rule")}
          value={`${summary.covered} · ${summary.pct}%`}
          tone={summary.pct >= 50 ? "ok" : "high"}
          hint={c("At least one enabled rule")}
        />
        <StatCard
          label={c("Taught by a lab")}
          value={matrix.totals.with_labs}
          hint={c("Hands-on labs")}
        />
        <StatCard
          label={c("Taught by a story")}
          value={matrix.totals.with_stories}
          hint={c("Attack stories")}
        />
        <StatCard
          label={c("Lacking tests")}
          value={matrix.totals.lacking_tests}
          tone={matrix.totals.lacking_tests === 0 ? "ok" : "high"}
          hint={c("Covered, but no tested rule")}
        />
        <StatCard
          label={c("Seen in alerts")}
          value={matrix.totals.with_alerts}
          hint={c("Raised on this instance")}
        />
      </div>

      <div
        className="mb-3 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={c("Filter by platform")}
        data-testid="domain-filters"
      >
        <span className="text-xs text-muted-foreground">{c("Platform")}</span>
        <Link
          href={link({ domain: null })}
          aria-current={domain ? undefined : "true"}
          className={tabClass(!domain)}
        >
          {c("All")}
        </Link>
        {(framework === "atlas" ? (["AI Security"] as const) : DOMAINS).map((d) => (
          <Link
            key={d}
            href={link({ domain: d })}
            aria-current={domain === d ? "true" : undefined}
            className={tabClass(domain === d)}
            data-testid={`domain-${d.replace(" ", "-").toLowerCase()}`}
          >
            {d}
          </Link>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label={c("Views")}
          className="inline-flex flex-wrap rounded-md border border-border bg-muted/50 p-0.5"
        >
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={link({ view: v.value === "matrix" ? null : v.value })}
              aria-current={view === v.value ? "page" : undefined}
              className={tabClass(view === v.value)}
              data-testid={`view-${v.value}`}
            >
              {localizeKnownCopy(locale, v.label)}
            </Link>
          ))}
        </nav>
        {view === "matrix" ? (
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex rounded-md border border-border bg-muted/50 p-0.5"
              role="group"
              aria-label={c("Heatmap metric")}
            >
              {METRICS.map((m) => (
                <Link
                  key={m.value}
                  href={link({ metric: m.value === "rules" ? null : m.value })}
                  title={localizeKnownCopy(locale, m.hint)}
                  aria-current={metric === m.value ? "true" : undefined}
                  className={tabClass(metric === m.value)}
                >
                  {localizeKnownCopy(locale, m.label)}
                </Link>
              ))}
            </div>
            <Link
              href={link({ sub: showSub ? null : "1" })}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              {showSub ? c("Hide sub-techniques") : c("Show sub-techniques")}
            </Link>
          </div>
        ) : null}
      </div>

      {view === "matrix" ? (
        <>
          <MatrixView matrix={matrix} metric={metric} showSub={showSub} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <MatrixLegend metricLabel={metricInfo.label} />
            <p className="text-[11px] text-muted-foreground">{matrix.notice}</p>
          </div>
        </>
      ) : null}

      {view === "coverage" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold">{c("Coverage by tactic")}</h2>
              {matrix.columns
                .filter((c) => c.techniques.length)
                .map(({ tactic, techniques: ts }) => {
                  const s = coverageSummary(ts);
                  return (
                    <div key={tactic.id}>
                      <div className="mb-1 flex items-baseline justify-between text-xs">
                        <span>{tactic.name}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {s.covered}/{s.total} · {s.pct}%
                        </span>
                      </div>
                      <Progress
                        value={s.covered}
                        max={s.total}
                        label={`${tactic.name} detection coverage`}
                      />
                    </div>
                  );
                })}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold">
                {c("Gaps: no detection rule yet")} ({summary.gaps.length})
              </h2>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">
                {c(
                  "Techniques worth writing a rule for next. Prioritise by the threats you actually face.",
                )}
              </p>
              <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2" data-testid="gap-list">
                {summary.gaps.map((t) => (
                  <li key={t.id} className="min-w-0">
                    <TechniqueChip id={t.id} name={t.name} />
                  </li>
                ))}
                {summary.gaps.length === 0 ? (
                  <li className="text-xs text-muted-foreground">
                    {c("Every curated technique has a rule.")}
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {view === "content" ? <ContentCoverage techniques={unique} c={c} /> : null}

      {view === "tactics" ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {matrix.columns.map(({ tactic, techniques: ts }) => {
            const s = coverageSummary(ts);
            return (
              <li key={tactic.id}>
                <Card className="h-full p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold">{tactic.name}</h2>
                    <Badge variant="outline" className="font-mono">
                      {tactic.id}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                    {tactic.description}
                  </p>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px] text-muted-foreground">
                      <span>
                        {s.total} {c("techniques mapped")}
                      </span>
                      <span>
                        {s.covered} {c("with rules")}
                      </span>
                    </div>
                    <Progress
                      value={s.covered}
                      max={Math.max(s.total, 1)}
                      label={`${tactic.name} coverage`}
                    />
                  </div>
                  {tactic.url ? (
                    <a
                      href={tactic.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block text-[11px] text-primary hover:underline"
                    >
                      {c("View on MITRE")}
                    </a>
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      ) : null}

      {view === "techniques" ? (
        <>
          <Suspense>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <UrlSearch
                placeholder={c("Search techniques…")}
                className="w-full sm:w-72"
                label={c("Search techniques")}
              />
              <UrlSelect
                param="tactic"
                label={c("Tactic")}
                options={matrix.columns.map((c) => ({ value: c.tactic.id, label: c.tactic.name }))}
                className="w-52"
              />
              <UrlSelect
                param="covered"
                label={c("Coverage")}
                options={[
                  { value: "yes", label: c("Has a rule") },
                  { value: "no", label: c("No rule (gap)") },
                ]}
                className="w-48"
              />
              <UrlSelect
                param="tests"
                label={c("Tests")}
                options={[{ value: "lacking", label: c("Lacking tests") }]}
                className="w-44"
              />
              <ClearFilters keys={["q", "tactic", "covered", "tests"]} />
            </div>
          </Suspense>
          <TechniquesTable techniques={techniques} params={sp} c={c} />
        </>
      ) : null}
    </>
  );
}

function TechniquesTable({
  techniques,
  params,
  c,
}: {
  techniques: TechniqueCoverage[];
  params: SearchParams;
  c: CopyTranslate;
}) {
  const sort = [
    "id",
    "name",
    "labs",
    "rules",
    "tested_rules",
    "stories",
    "alerts",
    "investigations",
  ].includes(first(params.sort) ?? "")
    ? (first(params.sort) as string)
    : "id";
  const order = first(params.order) === "desc" ? "desc" : "asc";
  const sorted = [...techniques].sort((a, b) => {
    const av = a[sort as keyof TechniqueCoverage] as string | number;
    const bv = b[sort as keyof TechniqueCoverage] as string | number;
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv));
    return order === "asc" ? cmp : -cmp;
  });
  if (sorted.length === 0)
    return <EmptyState icon={<Grid3x3 />} title={c("No techniques match")} />;
  const sorting = { path: "/mitre", params, sort, order } as const;
  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          <SortTh label={c("ID")} column="id" className="w-32" {...sorting} />
          <SortTh label={c("Technique")} column="name" {...sorting} />
          <TH className="w-24">{c("Tactic")}</TH>
          <SortTh
            label={c("Labs")}
            column="labs"
            className="w-16 text-right"
            defaultOrder="desc"
            {...sorting}
          />
          <SortTh
            label={c("Rules")}
            column="rules"
            className="w-16 text-right"
            defaultOrder="desc"
            {...sorting}
          />
          <SortTh
            label={c("Tested")}
            column="tested_rules"
            className="w-20 text-right"
            defaultOrder="desc"
            {...sorting}
          />
          <SortTh
            label={c("Stories")}
            column="stories"
            className="w-20 text-right"
            defaultOrder="desc"
            {...sorting}
          />
          <SortTh
            label={c("Alerts")}
            column="alerts"
            className="w-16 text-right"
            defaultOrder="desc"
            {...sorting}
          />
          <SortTh
            label={c("Investigations")}
            column="investigations"
            className="w-32 text-right"
            defaultOrder="desc"
            {...sorting}
          />
        </TR>
      </THead>
      <TBody>
        {sorted.map((t) => (
          <TR key={t.id}>
            <TD className={cn("font-mono text-xs", t.is_subtechnique && "pl-6")}>
              <Link href={`/mitre/${t.id}`} className="text-primary hover:underline">
                {t.id}
              </Link>
            </TD>
            <TD>{t.name}</TD>
            <TD className="font-mono text-[11px] text-muted-foreground">
              {t.tactic_ids.join(", ")}
            </TD>
            <TD className="text-right tabular-nums">{t.labs}</TD>
            <TD className={cn("text-right tabular-nums", t.rules === 0 && "text-muted-foreground")}>
              {t.rules}
            </TD>
            <TD
              className={cn(
                "text-right tabular-nums",
                t.lacking_tests && "font-medium text-sev-medium",
              )}
              title={t.lacking_tests ? c("Covered, but no rule with tests") : undefined}
            >
              {t.tested_rules}
            </TD>
            <TD className="text-right tabular-nums">{t.stories}</TD>
            <TD className="text-right tabular-nums">{t.alerts}</TD>
            <TD className="text-right tabular-nums">{t.investigations}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function ContentCoverage({ techniques, c }: { techniques: TechniqueCoverage[]; c: CopyTranslate }) {
  const coverage = contentCoverage(techniques);
  const blocks = [
    {
      id: "labs",
      title: c("Covered by labs"),
      note: c("Hands-on labs teach these techniques."),
      items: coverage.labs,
    },
    {
      id: "detections",
      title: c("Covered by detections"),
      note: c("At least one enabled rule maps to them."),
      items: coverage.detections,
    },
    {
      id: "stories",
      title: c("Covered by stories"),
      note: c("An attack story walks through them."),
      items: coverage.stories,
    },
    {
      id: "lacking",
      title: c("Lacking tests"),
      note: c(
        "Covered by something, but no rule with positive and negative tests. Write tests, or a tested rule.",
      ),
      items: coverage.lackingTests,
    },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="content-coverage">
      {blocks.map((b) => (
        <Card key={b.id} data-testid={`coverage-${b.id}`}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">{b.title}</h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {b.items.length} {c("of")} {coverage.total}
              </span>
            </div>
            <Progress
              value={b.items.length}
              max={Math.max(coverage.total, 1)}
              label={`${b.title}: ${c("{{count}} of {{total}} techniques", { count: b.items.length, total: coverage.total })}`}
            />
            <p className="text-xs text-muted-foreground">{b.note}</p>
            <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {b.items.map((t) => (
                <li key={t.id} className="min-w-0">
                  <TechniqueChip id={t.id} name={t.name} />
                </li>
              ))}
              {b.items.length === 0 ? (
                <li className="text-xs text-muted-foreground">
                  {b.id === "lacking"
                    ? c("Every covered technique has a tested rule.")
                    : c("None.")}
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
