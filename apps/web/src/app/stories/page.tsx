import type { StorySummary } from "@cyberforge/types";
import { Badge, EmptyState } from "@cyberforge/ui";
import { BookOpenCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StoryGrid } from "@/components/stories/story-card";
import { apiGet } from "@/lib/api";

export const metadata = { title: "Attack stories" };

export default async function StoriesPage() {
  const stories = await apiGet<StorySummary[]>("/stories");
  return (
    <>
      <PageHeader
        title="Attack stories"
        description="Complete attack-and-defence narratives. Instead of one lab at a time, follow an incident from the first odd log line to lessons learned: reveal the evidence as it arrives, mark findings, answer the questions and make the calls an analyst has to make."
        meta={<Badge variant="outline">Synthetic data · progress stays in this browser</Badge>}
      />
      {stories.length === 0 ? (
        <EmptyState
          icon={<BookOpenCheck />}
          title="No stories yet"
          description="Stories live in the stories/ directory of the repository."
        />
      ) : (
        <StoryGrid stories={stories} />
      )}
    </>
  );
}
