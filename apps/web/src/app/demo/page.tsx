import type { DemoScenarioSummary, DemoScript } from "@cyberforge/types";
import { Badge } from "@cyberforge/ui";

import { DemoPlayer } from "@/components/demo/demo-player";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";
import { first, type SearchParams } from "@/lib/params";

export const metadata = { title: "Live demo" };

const SPEEDS = [1, 2, 4] as const;

export default async function DemoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const scenarios = await apiGet<DemoScenarioSummary[]>("/demo/scenarios");
  const slug = scenarios.find((s) => s.slug === first(sp.scenario))?.slug ?? scenarios[0]?.slug;
  const script = slug ? await apiGet<DemoScript>(`/demo/scenarios/${slug}`) : null;
  const t = Number(first(sp.t));
  const speed = Number(first(sp.speed));

  return (
    <>
      <PageHeader
        title="Live demo"
        description={
          script?.summary ??
          "A scripted incident that plays back in your browser. No external service and no AI provider is needed."
        }
        meta={
          <>
            <Badge variant="outline">Synthetic telemetry</Badge>
            <Badge variant="outline">Deterministic · same run every time</Badge>
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
        <p className="text-sm text-muted-foreground">No demo scenarios are installed.</p>
      )}
    </>
  );
}
