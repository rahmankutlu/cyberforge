import type { AISecurityOverview } from "@cyberforge/types";
import { Button, Card } from "@cyberforge/ui";
import { Clock, Play } from "lucide-react";
import Link from "next/link";

import { DifficultyBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { localizeContentTree } from "@/lib/i18n/content";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("AI security labs") };
}

export default async function AiLabsPage() {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const overview = localizeContentTree(
    locale,
    await apiGet<AISecurityOverview>("/ai-security/overview"),
  );
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: c("AI security"), href: "/ai-security" }, { label: c("Labs") }]}
        title={c("AI security labs")}
        description={c(
          "Five hands-on scenarios with synthetic agents and sandboxed tools. Each replays gateway telemetry, shows which trust boundary failed, and the detections that catch it.",
        )}
      />
      <ul className="grid gap-3 md:grid-cols-2">
        {overview.labs.map((lab) => (
          <li key={lab.slug}>
            <Card className="flex h-full flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {c("Lab {{number}}", { number: String(lab.number).padStart(2, "0") })}
                </span>
                <DifficultyBadge difficulty={lab.difficulty} />
              </div>
              <div>
                <h2 className="text-sm font-semibold">{lab.title}</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {lab.summary}
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="size-3" />
                  {formatDuration(lab.duration_minutes, locale)}
                </span>
                <Button asChild size="sm">
                  <Link href={`/labs/${lab.slug}`}>
                    <Play /> {c("Open lab")}
                  </Link>
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      <Card className="mt-5 p-4">
        <p className="text-[13px] font-medium">{c("Safety model for AI labs")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            {c(
              "Agents and tools are synthetic and run inside CyberForge's sandbox; the model is a deterministic local mock.",
            )}
          </li>
          <li>
            {c(
              "Nothing here targets an external AI service, and outbound tool calls in the scenarios are blocked by an allow-list you can read.",
            )}
          </li>
          <li>{c("All destinations use reserved .example domains.")}</li>
        </ul>
      </Card>
    </>
  );
}
