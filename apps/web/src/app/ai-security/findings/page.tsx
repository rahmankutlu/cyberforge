import type { AIFinding } from "@cyberforge/types";
import { Badge, EmptyState, Table, TBody, TD, TH, THead, TR } from "@cyberforge/ui";
import { Brain } from "lucide-react";
import Link from "next/link";

import { AlertStatusBadge, SeverityBadge, TechniqueChip } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { apiGet } from "@/lib/api";

export const metadata = { title: "AI security findings" };

export default async function AiFindingsPage() {
  const findings = await apiGet<AIFinding[]>("/ai-security/findings");
  const counts = new Map<string, number>();
  for (const f of findings) {
    const key = f.boundary_title ?? "Unclassified";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "AI security", href: "/ai-security" }, { label: "Findings" }]}
        title="AI security findings"
        description="Alerts raised on AI-gateway telemetry, classified by the trust boundary that failed and the control that belongs there."
        meta={[...counts.entries()].map(([name, n]) => (
          <Badge key={name} variant="outline">
            {name} · {n}
          </Badge>
        ))}
      />
      {findings.length === 0 ? (
        <EmptyState
          icon={<Brain />}
          title="No findings yet"
          description="Run one of the AI labs to generate telemetry and alerts."
        />
      ) : (
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH className="w-28">Severity</TH>
              <TH>Finding</TH>
              <TH className="w-44">Boundary</TH>
              <TH>What failed</TH>
              <TH>Control that belongs here</TH>
              <TH className="w-24 text-right">When</TH>
            </TR>
          </THead>
          <TBody>
            {findings.map((f) => (
              <TR key={f.alert.id} data-testid="finding-row" className="align-top">
                <TD>
                  <SeverityBadge severity={f.alert.severity} />
                </TD>
                <TD className="max-w-72">
                  <Link
                    href={`/soc/alerts/${f.alert.id}`}
                    className="block font-medium hover:text-primary"
                  >
                    {f.alert.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {f.alert.technique ? <TechniqueChip id={f.alert.technique.id} /> : null}
                    <AlertStatusBadge status={f.alert.status} />
                  </div>
                </TD>
                <TD>
                  {f.boundary_title ? (
                    <Badge variant="accent">{f.boundary_title}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TD>
                <TD className="max-w-64 text-xs text-muted-foreground">{f.what_failed}</TD>
                <TD className="max-w-64 text-xs text-muted-foreground">{f.control}</TD>
                <TD className="text-right text-xs text-muted-foreground">
                  <RelativeTime iso={f.alert.timestamp} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}
