import type { LabSummary, Page, RuleSummary } from "@cyberforge/types";

import { SigmaWorkbench } from "@/components/detections/sigma-workbench";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";
import { NEW_RULE_TEMPLATE } from "@/lib/sigma-template";

export const metadata = { title: "New detection rule" };

export default async function NewRulePage() {
  const [rules, labs] = await Promise.all([
    apiGet<Page<RuleSummary>>("/detections", { page_size: 200, sort: "title", format: "sigma" }),
    apiGet<LabSummary[]>("/labs"),
  ]);
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Detections", href: "/detections" }, { label: "New rule" }]}
        title="New Sigma rule"
        description="Start from the template or load a built-in rule as a starting point. Rules you save run against every new event alongside the built-in library."
      />
      <SigmaWorkbench
        mode="create"
        initialContent={NEW_RULE_TEMPLATE}
        presets={rules.items.map((r) => ({ slug: r.slug, title: r.title, format: r.format }))}
        labs={labs.map((l) => ({ slug: l.slug, title: l.title, number: l.number }))}
      />
    </>
  );
}
