import type { Story } from "@cyberforge/types";
import { Badge } from "@cyberforge/ui";
import { Clock, Radio } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DifficultyBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { StoryPlayer } from "@/components/stories/story-player";
import { apiGetOrNull } from "@/lib/api";
import { STORY_DOMAIN_LABEL } from "@/lib/format";
import { createCopyTranslator, localizeKnownCopy } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { localizeContent, localizeContentTree } from "@/lib/i18n/content";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const story = await apiGetOrNull<Story>(`/stories/${slug}`).catch(() => null);
  const locale = await getLocale();
  return {
    title: story
      ? localizeContent(locale, story.title)
      : createCopyTranslator(locale)("Attack stories"),
  };
}

export default async function StoryPage({ params }: Props) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const { slug } = await params;
  const sourceStory = await apiGetOrNull<Story>(`/stories/${slug}`);
  if (!sourceStory) notFound();
  const story = localizeContentTree(locale, sourceStory);
  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: c("Stories"), href: "/stories" },
          { label: localizeContent(locale, story.title) },
        ]}
        title={localizeContent(locale, story.title)}
        description={localizeContent(locale, story.summary)}
        meta={
          <>
            <DifficultyBadge difficulty={story.difficulty} />
            <Badge variant="outline">
              {localizeKnownCopy(locale, STORY_DOMAIN_LABEL[story.domain] ?? story.domain)}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="size-3" /> ~{c("{{count}} min", { count: story.duration_minutes })}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Radio className="size-3" /> {c("{{count}} steps", { count: story.step_count })}
            </Badge>
          </>
        }
      />
      <StoryPlayer story={story} />
    </>
  );
}
