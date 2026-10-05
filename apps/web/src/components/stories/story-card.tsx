"use client";

import type { StorySummary } from "@cyberforge/types";
import { Badge, Card, Progress } from "@cyberforge/ui";
import { Clock, Crosshair, Grid3x3, Radio } from "lucide-react";
import Link from "next/link";

import { DifficultyBadge } from "@/components/badges";
import { STORY_DOMAIN_LABEL } from "@/lib/format";
import { completion } from "@/lib/story-state";
import { useAllStoryProgress } from "@/lib/use-story-progress";
import { useLocale } from "@/components/i18n/locale-provider";
import { localizeKnownCopy } from "@/lib/i18n/copy";

export function StoryGrid({ stories }: { stories: StorySummary[] }) {
  const { locale, c } = useLocale();
  const progress = useAllStoryProgress(stories.map((s) => s.slug));
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="story-grid">
      {stories.map((story) => {
        const p = progress[story.slug];
        const pct = p ? completion(story, p) : 0;
        const started = p ? p.revealed > 1 || p.found.length > 0 || p.submitted : false;
        return (
          <li key={story.slug}>
            <Card
              className="group flex h-full flex-col transition-colors hover:border-primary/40"
              data-story={story.slug}
            >
              <Link
                href={`/stories/${story.slug}`}
                className="flex flex-1 flex-col gap-3 rounded-lg p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex items-start justify-between gap-2">
                  <Badge variant="outline">
                    {localizeKnownCopy(locale, STORY_DOMAIN_LABEL[story.domain] ?? story.domain)}
                  </Badge>
                  <DifficultyBadge difficulty={story.difficulty} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold leading-snug group-hover:text-primary">
                    {story.title}
                  </h2>
                  <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                    {story.summary}
                  </p>
                </div>
                <ul
                  className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
                  aria-label={c("Story facts")}
                >
                  <li className="inline-flex items-center gap-1">
                    <Clock className="size-3" aria-hidden /> ~{story.duration_minutes} {c("min")}
                  </li>
                  <li className="inline-flex items-center gap-1">
                    <Radio className="size-3" aria-hidden /> {story.step_count} {c("steps")} ·{" "}
                    {story.event_count} {c("events")}
                  </li>
                  <li className="inline-flex items-center gap-1">
                    <Crosshair className="size-3" aria-hidden /> {story.detection_count}{" "}
                    {c("detections")}
                  </li>
                  <li className="inline-flex items-center gap-1">
                    <Grid3x3 className="size-3" aria-hidden /> {story.techniques.length}{" "}
                    {c("techniques")}
                  </li>
                </ul>
                {started ? (
                  <div>
                    <Progress value={pct} max={100} label={`${story.title} progress`} />
                    <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                      {p?.submitted ? c("Completed") : `%${pct}`}
                    </p>
                  </div>
                ) : null}
              </Link>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
