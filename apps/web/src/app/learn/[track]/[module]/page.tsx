import type { LabSummary, LearningOverview, ModuleDetail } from "@cyberforge/types";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@cyberforge/ui";
import { ArrowLeft, ArrowRight, FlaskConical } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { TechniqueChip } from "@/components/badges";
import { CompleteButton } from "@/components/learn/progress";
import { Markdown } from "@/components/markdown";
import { PageHeader } from "@/components/page-header";
import { ApiError, apiGet } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { localizeContent, localizeContentTree } from "@/lib/i18n/content";

type Props = { params: Promise<{ track: string; module: string }> };

export async function generateMetadata({ params }: Props) {
  const { module: slug } = await params;
  const mod = await apiGet<ModuleDetail>(`/learning/modules/${slug}`).catch(() => null);
  const locale = await getLocale();
  return {
    title: mod ? localizeContent(locale, mod.title) : createCopyTranslator(locale)("Lesson"),
  };
}

export default async function ModulePage({ params }: Props) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const { track: trackSlug, module: slug } = await params;
  const sourceModule = await apiGet<ModuleDetail>(`/learning/modules/${slug}`).catch(
    (e: unknown) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    },
  );
  if (!sourceModule || sourceModule.track !== trackSlug) notFound();
  const mod = localizeContentTree(locale, sourceModule);

  const [sourceOverview, sourceLabs] = await Promise.all([
    apiGet<LearningOverview>("/learning"),
    apiGet<LabSummary[]>("/labs"),
  ]);
  const overview = localizeContentTree(locale, sourceOverview);
  const labs = localizeContentTree(locale, sourceLabs);
  const track =
    trackSlug === "30-days"
      ? overview.thirty_days
      : overview.tracks.find((t) => t.slug === trackSlug);
  const siblings = track?.modules ?? [];
  const index = siblings.findIndex((m) => m.slug === mod.slug);
  const prev = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 ? siblings[index + 1] : undefined;
  const relatedLabs = labs.filter((l) => mod.lab_slugs.includes(l.slug));

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: c("Learn"), href: "/learn" },
          {
            label: localizeContent(locale, track?.title ?? trackSlug),
            href: `/learn/${trackSlug}`,
          },
          { label: localizeContent(locale, mod.title) },
        ]}
        title={localizeContent(locale, mod.title)}
        description={localizeContent(locale, mod.summary)}
        meta={
          <span className="text-xs text-muted-foreground">
            {formatDuration(mod.duration_minutes, locale)}
            {mod.day ? ` · ${c("Day {{day}} of 30", { day: mod.day })}` : ""}
          </span>
        }
        actions={<CompleteButton slug={mod.slug} />}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <article className="min-w-0 rounded-lg border border-border bg-card p-6">
          <Markdown>{mod.body}</Markdown>
        </article>

        <aside className="space-y-4">
          {relatedLabs.length ? (
            <Card>
              <CardHeader>
                <CardTitle>{c("Try it in a lab")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {relatedLabs.map((lab) => (
                  <Link
                    key={lab.slug}
                    href={`/labs/${lab.slug}`}
                    className="flex items-start gap-2 rounded-md border border-border p-2.5 text-[13px] transition-colors hover:border-primary/40 hover:bg-muted/30"
                  >
                    <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    {lab.title}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {mod.rule_slugs.length ? (
            <Card>
              <CardHeader>
                <CardTitle>{c("Related detections")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {mod.rule_slugs.map((r) => (
                  <Link
                    key={r}
                    href={`/detections/${r}`}
                    className="block truncate font-mono text-xs text-primary hover:underline"
                  >
                    {r}
                  </Link>
                ))}
              </CardContent>
            </Card>
          ) : null}
          {mod.technique_ids.length ? (
            <Card>
              <CardHeader>
                <CardTitle>{c("MITRE techniques")}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {mod.technique_ids.map((t) => (
                  <TechniqueChip key={t} id={t} />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>

      <nav
        aria-label={c("Lesson navigation")}
        className="mt-6 flex items-center justify-between gap-3"
      >
        {prev ? (
          <Button asChild variant="outline">
            <Link href={`/learn/${trackSlug}/${prev.slug}`}>
              <ArrowLeft /> {prev.title}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {next ? (
          <Button asChild variant="outline">
            <Link href={`/learn/${trackSlug}/${next.slug}`}>
              {next.title} <ArrowRight />
            </Link>
          </Button>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
