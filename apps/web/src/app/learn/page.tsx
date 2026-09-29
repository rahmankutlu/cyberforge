import type { LearningOverview } from "@cyberforge/types";
import { Badge, Button, Card } from "@cyberforge/ui";
import {
  ArrowRight,
  BookOpen,
  Brain,
  Compass,
  Crosshair,
  Globe,
  GraduationCap,
  Network,
  Radar,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { TrackProgress } from "@/components/learn/progress";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";
import { formatDuration } from "@/lib/format";

export const metadata = { title: "Learn" };

const ICONS: Record<string, LucideIcon> = {
  compass: Compass,
  radar: Radar,
  crosshair: Crosshair,
  globe: Globe,
  network: Network,
  brain: Brain,
  calendar: BookOpen,
};

export default async function LearnPage() {
  const data = await apiGet<LearningOverview>("/learning");

  return (
    <>
      <PageHeader
        title="Learn"
        description="Six tracks and a 30-day plan that connect theory to the labs, rules and MITRE techniques in CyberForge. No account needed: your progress is kept in this browser."
        meta={<Badge variant="outline">Progress stays on this device</Badge>}
      />

      {data.thirty_days ? (
        <Card className="mb-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <BookOpen className="size-4 text-primary" /> {data.thirty_days.title}
              </p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {data.thirty_days.summary}
              </p>
              <TrackProgress
                slugs={data.thirty_days.modules.map((m) => m.slug)}
                className="mt-3 max-w-md"
              />
            </div>
            <Button asChild>
              <Link href="/learn/30-days">
                Open the plan <ArrowRight />
              </Link>
            </Button>
          </div>
        </Card>
      ) : null}

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.tracks.map((track) => {
          const Icon = ICONS[track.icon] ?? GraduationCap;
          return (
            <li key={track.slug}>
              <Card className="flex h-full flex-col p-4 transition-colors hover:border-primary/40">
                <Link
                  href={`/learn/${track.slug}`}
                  className="flex flex-1 flex-col rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex size-8 items-center justify-center rounded-md border border-border bg-muted/50">
                    <Icon className="size-4 text-primary" />
                  </span>
                  <h2 className="mt-3 text-sm font-semibold">{track.title}</h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{track.audience}</p>
                  <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                    {track.summary}
                  </p>
                </Link>
                <div className="mt-4">
                  <TrackProgress slugs={track.modules.map((m) => m.slug)} />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {track.modules.length} modules · {formatDuration(track.total_minutes)}
                  </p>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
