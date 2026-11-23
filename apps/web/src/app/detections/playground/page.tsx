import type { Page, PlaygroundDataset, PlaygroundDatasetDetail, RuleDetail, RuleSummary } from "@cyberforge/types";

import { PageHeader } from "@/components/page-header";
import { Playground } from "@/components/playground/playground";
import { apiGet, apiGetOrNull, buildQuery } from "@/lib/api";
import { DEMO_SPEEDS } from "@/lib/demo-engine";
import { localizeContent } from "@/lib/i18n/content";
import { first, type SearchParams } from "@/lib/params";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { parseReplayDataset } from "@/lib/playground";

export async function generateMetadata() {
  const c = createCopyTranslator(await getLocale());
  return { title: c("Detection playground") };
}

const DEFAULT_RULE = "win-encoded-powershell-command";
const DEFAULT_DATASET = "suspicious-powershell-simulation";

export default async function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const sp = await searchParams;
  const source = first(sp.dataset);
  const reference = parseReplayDataset(source);
  const ruleParam = first(sp.rule);
  const slug = ruleParam && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ruleParam) && ruleParam.length <= 160
    ? ruleParam : DEFAULT_RULE;
  const [rules, datasets, requestedRule, replayData] = await Promise.all([
    apiGet<Page<RuleSummary>>("/detections", { page_size: 200, sort: "title" }),
    apiGet<PlaygroundDataset[]>("/playground/datasets"),
    apiGetOrNull<RuleDetail>(`/detections/${slug}`),
    reference ? apiGetOrNull<PlaygroundDatasetDetail>(`/playground/datasets/${encodeURIComponent(source!)}`) : null,
  ]);
  const initial =
    requestedRule ??
    (slug === DEFAULT_RULE ? null : await apiGetOrNull<RuleDetail>(`/detections/${DEFAULT_RULE}`));
  const format = initial?.format ?? "sigma";
  const wanted = format === "yara" ? "files" : "events";
  const requested = datasets.find((d) => d.slug === source);
  const focused = replayData?.items.find((item) => item.index === reference?.focusedIndex);
  const replayTime = Number(first(sp.t));
  const speed = DEMO_SPEEDS.find((choice) => choice === Number(first(sp.speed)));
  const replay = replayData && reference && focused && wanted === "events"
    ? {
        dataset: { ...replayData, name: localizeContent(locale, replayData.name) },
        focusedIndex: focused.index,
        returnHref: `/demo${buildQuery({
          scenario: reference.scenario,
          event: reference.event,
          t: Number.isFinite(replayTime) ? Math.max(replayTime, focused.offset_seconds) : focused.offset_seconds,
          speed,
        })}`,
      }
    : null;
  const suited = datasets.find(
    (d) => initial && d.expected_rules.some((r) => r.slug === initial.slug),
  );
  const dataset =
    replay?.dataset ??
    (requested?.kind === wanted ? requested : undefined) ??
    suited ??
    datasets.find((d) => d.slug === DEFAULT_DATASET && d.kind === wanted) ??
    datasets.find((d) => d.kind === wanted) ??
    datasets[0];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: c("Detections"), href: "/detections" }, { label: c("Playground") }]}
        title={c("Detection playground")}
        description={c(
          "Pick a dataset, edit a rule, run it, and see exactly why each event matched: which selection, which field, which value, and how the condition resolved. Sigma, YARA and Suricata. Everything runs locally on synthetic data.",
        )}
      />
      {source?.startsWith("demo:") && !replay && wanted === "events" ? (
        <p className="mb-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
          {c("Replay evidence is unavailable. Choose a curated dataset to continue.")}
        </p>
      ) : null}
      <Playground
        key={`${initial?.slug ?? ""}:${dataset?.slug ?? ""}`}
        initialContent={initial?.content ?? ""}
        initialFormat={format}
        initialDataset={dataset?.slug ?? DEFAULT_DATASET}
        initialRule={initial?.slug}
        presets={rules.items.map((r) => ({ slug: r.slug, title: r.title, format: r.format }))}
        datasets={datasets}
        replaySource={replay}
      />
    </>
  );
}
