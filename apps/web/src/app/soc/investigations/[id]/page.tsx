import type { Analyst, IncidentReport, InvestigationDetail } from "@cyberforge/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@cyberforge/ui";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  InvestigationStatusBadge,
  SeverityBadge,
  SyntheticBadge,
  TechniqueChip,
} from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { AlertsTable } from "@/components/soc/alerts-table";
import { InvestigationControls } from "@/components/soc/investigation-controls";
import { NotesPanel } from "@/components/soc/notes-panel";
import { ReportEditor } from "@/components/soc/report-editor";
import { TimelinePanel } from "@/components/soc/timeline-panel";
import { apiGet, apiGetOrNull } from "@/lib/api";
import { first, type SearchParams } from "@/lib/params";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Investigation #${id}` };
}

const TABS = ["overview", "timeline", "notes", "report"];

export default async function InvestigationPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(id)) notFound();
  const investigation = await apiGetOrNull<InvestigationDetail>(`/investigations/${id}`);
  if (!investigation) notFound();
  const [analysts, report] = await Promise.all([
    apiGet<Analyst[]>("/analysts"),
    apiGet<IncidentReport>(`/investigations/${id}/report`),
  ]);
  const requested = first(sp.tab);
  const tab = TABS.includes(requested ?? "") ? (requested as string) : "overview";

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Mini SOC", href: "/soc" },
          { label: "Investigations", href: "/soc/investigations" },
          { label: `#${investigation.id}` },
        ]}
        title={investigation.title}
        description={investigation.summary || undefined}
        meta={
          <>
            <SeverityBadge severity={investigation.severity} />
            <InvestigationStatusBadge status={investigation.status} />
            {investigation.synthetic ? <SyntheticBadge /> : null}
            <span className="text-xs text-muted-foreground">
              Updated <RelativeTime iso={investigation.updated_at} />
            </span>
          </>
        }
        actions={<InvestigationControls investigation={investigation} analysts={analysts} />}
      />

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline ({investigation.timeline.length})</TabsTrigger>
          <TabsTrigger value="notes" data-testid="inv-tab-notes">
            Notes ({investigation.notes.length})
          </TabsTrigger>
          <TabsTrigger value="report" data-testid="inv-tab-report">
            Report
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section>
              <h2 className="mb-2 text-sm font-semibold">
                Linked alerts ({investigation.alerts.length})
              </h2>
              <AlertsTable
                alerts={investigation.alerts}
                compact
                emptyTitle="No alerts attached"
                emptyDescription="Open an alert and use “Create investigation”, or attach alerts through the API."
              />
            </section>
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>MITRE techniques</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {investigation.techniques.length ? (
                  investigation.techniques.map((t) => (
                    <TechniqueChip key={t.id} id={t.id} name={t.name} />
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">None yet.</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  Lead: {investigation.lead?.name ?? "not assigned"}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          <TimelinePanel investigationId={investigation.id} entries={investigation.timeline} />
        </TabsContent>

        <TabsContent value="notes">
          <NotesPanel
            notes={investigation.notes}
            analysts={analysts}
            target={{ kind: "investigation", id: investigation.id }}
          />
        </TabsContent>

        <TabsContent value="report">
          <ReportEditor investigationId={investigation.id} report={report} />
        </TabsContent>
      </Tabs>
    </>
  );
}
