import type { DemoScenarioSummary, DemoScript } from "@cyberforge/types";
import { Badge } from "@cyberforge/ui";

import { DemoPlayer } from "@/components/demo/demo-player";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";
import { DEMO_SPEEDS } from "@/lib/demo-engine";
import { first, type SearchParams } from "@/lib/params";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { localizeContent, localizeContentTree } from "@/lib/i18n/content";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("Live demo") };
}

export default async function DemoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const sp = await searchParams;
  const scenarios = await apiGet<DemoScenarioSummary[]>("/demo/scenarios");
  const slug = scenarios.find((s) => s.slug === first(sp.scenario))?.slug ?? scenarios[0]?.slug;
  const data = slug ? await apiGet<DemoScript>(`/demo/scenarios/${slug}`) : null;
  let script = data;
  if (data && locale === "tr") {
    const { events, ...scenario } = data;
    script = {
      ...localizeContentTree(locale, scenario),
      // Localize the analyst's annotation while keeping captured and parsed telemetry exact.
      events: events.map((event) => ({
        ...event,
        note: event.note ? localizeContent(locale, event.note) : event.note,
      })),
    };
  }
  const t = Number(first(sp.t));
  const speed = Number(first(sp.speed));
  const initialTime =
    script && Number.isFinite(t) ? Math.max(0, Math.min(t, script.duration_seconds)) : 0;
  const initialEventId = script?.events.find(
    (event) => event.id === first(sp.event) && event.t <= initialTime,
  )?.id;
  const initialSpeed = DEMO_SPEEDS.find((s) => s === speed) ?? 1;
  const autoplay = first(sp.autoplay) === "1" && initialEventId === undefined;

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
            {script ? (
              <span className="text-xs font-medium text-muted-foreground">{script.title}</span>
            ) : null}
          </>
        }
      />
      {script ? (
        <DemoPlayer
          key={`${script.slug}:${initialTime}:${initialSpeed}:${autoplay}:${initialEventId ?? ""}`}
          script={script}
          initialTime={initialTime}
          initialEventId={initialEventId}
          autoplay={autoplay}
          initialSpeed={initialSpeed}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{c("No demo scenarios are installed.")}</p>
      )}
    </>
  );
}
