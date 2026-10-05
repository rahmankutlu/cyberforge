import type { Page, PlaygroundDataset, RuleDetail, RuleSummary } from "@cyberforge/types";

import { PageHeader } from "@/components/page-header";
import { Playground } from "@/components/playground/playground";
import { apiGet, apiGetOrNull } from "@/lib/api";
import { first, type SearchParams } from "@/lib/params";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";

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
  const c = createCopyTranslator(await getLocale());
  const sp = await searchParams;
  const [rules, datasets] = await Promise.all([
    apiGet<Page<RuleSummary>>("/detections", { page_size: 200, sort: "title" }),
    apiGet<PlaygroundDataset[]>("/playground/datasets"),
  ]);
  const slug = first(sp.rule) ?? DEFAULT_RULE;
  const initial =
    (await apiGetOrNull<RuleDetail>(`/detections/${slug}`)) ??
    (await apiGetOrNull<RuleDetail>(`/detections/${DEFAULT_RULE}`));
  const format = initial?.format ?? "sigma";
  const wanted = format === "yara" ? "files" : "events";
  const requested = datasets.find((d) => d.slug === first(sp.dataset));
  const suited = datasets.find(
    (d) => initial && d.expected_rules.some((r) => r.slug === initial.slug),
  );
  const dataset =
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
      <Playground
        initialContent={initial?.content ?? ""}
        initialFormat={format}
        initialDataset={dataset?.slug ?? DEFAULT_DATASET}
        presets={rules.items.map((r) => ({ slug: r.slug, title: r.title, format: r.format }))}
        datasets={datasets}
      />
    </>
  );
}
