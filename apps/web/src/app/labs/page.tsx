import type { LabSummary } from "@cyberforge/types";
import { Badge, Card, EmptyState } from "@cyberforge/ui";
import { Clock, Container, FlaskConical, Play, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";

import { DifficultyBadge } from "@/components/badges";
import { ClearFilters, PersistFilters, UrlSearch, UrlSelect } from "@/components/data/url-filters";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";
import { formatDuration, titleCase } from "@/lib/format";
import { first, type SearchParams } from "@/lib/params";
import { createCopyTranslator, localizeKnownCopy } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { localizeContent } from "@/lib/i18n/content";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("Cyber range") };
}

const DOMAINS = ["web", "api", "linux", "windows-sim", "network", "cloud", "ai-security"];

export default async function LabsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const sp = await searchParams;
  const labs = await apiGet<LabSummary[]>("/labs", {
    domain: first(sp.domain),
    difficulty: first(sp.difficulty),
    q: first(sp.q),
  });
  const all = await apiGet<LabSummary[]>("/labs");
  const completed = all.filter((l) => l.run_count > 0).length;

  return (
    <>
      <PageHeader
        title={c("Cyber range")}
        description={c(
          "Twenty safe, self-contained labs. Each one runs an attack simulation as telemetry, shows the logs it produces, the detections that fire, and how to investigate and mitigate.",
        )}
        meta={
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="size-3" />{" "}
            {c("Simulation-only by default · lab targets never leave the isolated network")}
          </Badge>
        }
      />

      <Suspense>
        <PersistFilters storageKey="labs" />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <UrlSearch
            placeholder={c("Search labs…")}
            className="w-full sm:w-64"
            label={c("Search labs")}
          />
          <UrlSelect
            param="domain"
            label={c("Domain")}
            options={DOMAINS.map((d) => ({
              value: d,
              label: localizeKnownCopy(locale, titleCase(d)),
            }))}
            className="w-44"
          />
          <UrlSelect
            param="difficulty"
            label={c("Difficulty")}
            options={["beginner", "intermediate", "advanced"].map((d) => ({
              value: d,
              label: localizeKnownCopy(locale, titleCase(d)),
            }))}
            className="w-44"
          />
          <ClearFilters keys={["q", "domain", "difficulty"]} storageKey="labs" />
          <p className="ml-auto text-xs text-muted-foreground">
            {c("{{completed}} of {{total}} run on this instance", { completed, total: all.length })}
          </p>
        </div>
      </Suspense>

      {labs.length === 0 ? (
        <EmptyState
          icon={<FlaskConical />}
          title={c("No labs match")}
          description={c("Try a different search or clear the filters.")}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="lab-grid">
          {labs.map((lab) => (
            <li key={lab.slug}>
              <Card className="group flex h-full flex-col transition-colors hover:border-primary/40">
                <Link
                  href={`/labs/${lab.slug}`}
                  className="flex flex-1 flex-col gap-3 rounded-lg p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {c("Lab {{number}}", { number: String(lab.number).padStart(2, "0") })}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {lab.requires_containers ? (
                        <Badge
                          variant="outline"
                          title={c("Optional live mode with an intentionally vulnerable container")}
                        >
                          <Container className="size-3" /> {c("live mode")}
                        </Badge>
                      ) : null}
                      <DifficultyBadge difficulty={lab.difficulty} />
                    </div>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold leading-snug group-hover:text-primary">
                      {localizeContent(locale, lab.title)}
                    </h2>
                    <p className="mt-1.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {localizeContent(locale, lab.summary)}
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {lab.techniques.slice(0, 3).map((t) => (
                      <Badge key={t.id} variant="outline" className="font-mono">
                        {t.id}
                      </Badge>
                    ))}
                    {lab.techniques.length > 3 ? (
                      <Badge variant="outline">+{lab.techniques.length - 3}</Badge>
                    ) : null}
                  </div>
                </Link>
                <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatDuration(lab.duration_minutes, locale)}
                    </span>
                    <span>{localizeKnownCopy(locale, titleCase(lab.domain))}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Play className="size-3" />
                    {lab.run_count > 0
                      ? c(lab.run_count === 1 ? "{{count}} run" : "{{count}} runs", {
                          count: lab.run_count,
                        })
                      : c("Not run")}
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
