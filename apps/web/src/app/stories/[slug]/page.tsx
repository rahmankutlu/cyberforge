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

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const story = await apiGetOrNull<Story>(`/stories/${slug}`).catch(() => null);
  return { title: story?.title ?? "Attack story" };
}

export default async function StoryPage({ params }: Props) {
  const { slug } = await params;
  const story = await apiGetOrNull<Story>(`/stories/${slug}`);
  if (!story) notFound();
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Stories", href: "/stories" }, { label: story.title }]}
        title={story.title}
        description={story.summary}
        meta={
          <>
            <DifficultyBadge difficulty={story.difficulty} />
            <Badge variant="outline">{STORY_DOMAIN_LABEL[story.domain] ?? story.domain}</Badge>
            <Badge variant="outline" className="gap-1">
              <Clock className="size-3" /> ~{story.duration_minutes} min
            </Badge>
            <Badge variant="outline" className="gap-1">
              <Radio className="size-3" /> {story.step_count} steps
            </Badge>
          </>
        }
      />
      <StoryPlayer story={story} />
    </>
  );
}
