import type { StorySummary } from "@cyberforge/types";
import { Badge, EmptyState } from "@cyberforge/ui";
import { BookOpenCheck } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { StoryGrid } from "@/components/stories/story-card";
import { apiGet } from "@/lib/api";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { localizeContentTree } from "@/lib/i18n/content";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("Attack stories") };
}

export default async function StoriesPage() {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const stories = localizeContentTree(locale, await apiGet<StorySummary[]>("/stories"));
  return (
    <>
      <PageHeader
        title={c("Attack stories")}
        description={c(
          "Complete attack-and-defence narratives. Instead of one lab at a time, follow an incident from the first odd log line to lessons learned: reveal the evidence as it arrives, mark findings, answer the questions and make the calls an analyst has to make.",
        )}
        meta={
          <Badge variant="outline">{c("Synthetic data · progress stays in this browser")}</Badge>
        }
      />
      {stories.length === 0 ? (
        <EmptyState
          icon={<BookOpenCheck />}
          title={c("No stories yet")}
          description={c("Stories live in the stories/ directory of the repository.")}
        />
      ) : (
        <StoryGrid stories={stories} />
      )}
    </>
  );
}
