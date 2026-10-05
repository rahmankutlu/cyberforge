import type { LearningOverview, Track } from "@cyberforge/types";
import { Badge, Card } from "@cyberforge/ui";
import { Clock, FlaskConical } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DayCell, ModuleCheck, TrackProgress } from "@/components/learn/progress";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { localizeContent } from "@/lib/i18n/content";

type Props = { params: Promise<{ track: string }> };

async function findTrack(slug: string): Promise<Track | null> {
  const data = await apiGet<LearningOverview>("/learning");
  if (slug === "30-days") return data.thirty_days;
  return data.tracks.find((t) => t.slug === slug) ?? null;
}

export async function generateMetadata({ params }: Props) {
  const { track } = await params;
  const found = await findTrack(track).catch(() => null);
  const locale = await getLocale();
  return {
    title: found ? localizeContent(locale, found.title) : createCopyTranslator(locale)("Learn"),
  };
}

export default async function TrackPage({ params }: Props) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const { track: slug } = await params;
  const track = await findTrack(slug);
  if (!track) notFound();
  const isPlan = slug === "30-days";
  const slugs = track.modules.map((m) => m.slug);

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: c("Learn"), href: "/learn" },
          { label: localizeContent(locale, track.title) },
        ]}
        title={localizeContent(locale, track.title)}
        description={localizeContent(locale, track.summary)}
        meta={
          <Badge variant="outline">
            {track.modules.length} {isPlan ? c("days") : c("modules")} ·{" "}
            {formatDuration(track.total_minutes, locale)}
          </Badge>
        }
      />
      <TrackProgress slugs={slugs} className="mb-6 max-w-md" />

      {isPlan ? (
        <ol
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5"
          data-testid="day-grid"
        >
          {track.modules.map((m) => (
            <li key={m.slug}>
              <DayCell
                slug={m.slug}
                day={m.day ?? m.position}
                title={m.title}
                href={`/learn/30-days/${m.slug}`}
              />
            </li>
          ))}
        </ol>
      ) : (
        <ol className="space-y-2" data-testid="module-list">
          {track.modules.map((m, i) => (
            <li key={m.slug}>
              <Card className="flex items-start gap-3 p-4">
                <ModuleCheck slug={m.slug} title={m.title} />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/learn/${track.slug}/${m.slug}`}
                    className="text-sm font-semibold outline-none hover:text-primary focus-visible:underline"
                  >
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {m.title}
                  </Link>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{m.summary}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {formatDuration(m.duration_minutes, locale)}
                    </span>
                    {m.lab_slugs.length ? (
                      <span className="flex items-center gap-1">
                        <FlaskConical className="size-3" />
                        {m.lab_slugs.length} {c("Lab")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
