import type { DemoScenarioSummary, DemoScript } from "@cyberforge/types";
import { Badge } from "@cyberforge/ui";

import { DemoPlayer } from "@/components/demo/demo-player";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";
import { first, type SearchParams } from "@/lib/params";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { localizeContentTree } from "@/lib/i18n/content";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("Live demo") };
}

const SPEEDS = [1, 2, 4] as const;

export default async function DemoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const sp = await searchParams;
  const scenarios = await apiGet<DemoScenarioSummary[]>("/demo/scenarios");
  const slug = scenarios.find((s) => s.slug === first(sp.scenario))?.slug ?? scenarios[0]?.slug;
  const script = slug
    ? localizeContentTree(locale, await apiGet<DemoScript>(`/demo/scenarios/${slug}`))
    : null;
  const t = Number(first(sp.t));
  const speed = Number(first(sp.speed));

  return (
    <>
      <PageHeader
        title={c("Live demo")}
        description={
          script?.summary ??
          c(
            "A scripted incident that plays back in your browser. No external service and no AI provider is needed.",
          )
        }
        meta={
          <>
            <Badge variant="outline">{c("Synthetic telemetry")}</Badge>
            <Badge variant="outline">{c("Deterministic · same run every time")}</Badge>
            {script ? <Badge variant="outline">{script.title}</Badge> : null}
          </>
        }
      />
      {script ? (
        <DemoPlayer
          script={script}
          initialTime={Number.isFinite(t) && t > 0 ? Math.min(t, script.duration_seconds) : 0}
          autoplay={first(sp.autoplay) === "1"}
          initialSpeed={SPEEDS.find((s) => s === speed) ?? 1}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{c("No demo scenarios are installed.")}</p>
      )}
    </>
  );
}
