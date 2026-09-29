import type { LabSummary, Page, RuleDetail, RuleSummary } from "@cyberforge/types";

import { SigmaWorkbench } from "@/components/detections/sigma-workbench";
import { PageHeader } from "@/components/page-header";
import { apiGet, apiGetOrNull } from "@/lib/api";
import { first, type SearchParams } from "@/lib/params";

export const metadata = { title: "Detection playground" };

export default async function PlaygroundPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const [rules, labs] = await Promise.all([
    apiGet<Page<RuleSummary>>("/detections", { page_size: 200, sort: "title" }),
    apiGet<LabSummary[]>("/labs"),
  ]);
  const slug = first(sp.rule) ?? "win-encoded-powershell-command";
  const initial = await apiGetOrNull<RuleDetail>(`/detections/${slug}`);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Detections", href: "/detections" }, { label: "Playground" }]}
        title="Detection playground"
        description="Write or paste a Sigma rule, validate it, translate it to Elastic, Splunk, Sentinel, OpenSearch or SQL, and test it against sample or lab events. Everything runs locally."
      />
      <SigmaWorkbench
        mode="playground"
        initialContent={initial?.content ?? ""}
        presets={rules.items.map((r) => ({ slug: r.slug, title: r.title, format: r.format }))}
        labs={labs.map((l) => ({ slug: l.slug, title: l.title, number: l.number }))}
      />
    </>
  );
}
