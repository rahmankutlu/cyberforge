import type { AlertDetail, Analyst, Lifecycle } from "@cyberforge/types";
import {
  Badge,
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
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AlertStatusBadge,
  SeverityBadge,
  SyntheticBadge,
  TechniqueChip,
} from "@/components/badges";
import { LifecycleFlow } from "@/components/lifecycle/lifecycle-flow";
import { PageHeader } from "@/components/page-header";
import { RelativeTime } from "@/components/relative-time";
import { AiAnalysisPanel } from "@/components/soc/ai-analysis-panel";
import { AlertActions } from "@/components/soc/alert-actions";
import { AlertsTable } from "@/components/soc/alerts-table";
import { NotesPanel } from "@/components/soc/notes-panel";
import { CodeBlock } from "@/components/code-block";
import { apiGet, apiGetOrNull } from "@/lib/api";
import { formatDateTimeFull } from "@/lib/format";
import { first, type SearchParams } from "@/lib/params";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `Alert #${id}` };
}

const TABS = ["overview", "lifecycle", "evidence", "notes", "ai"] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-[13px]">{children}</dd>
    </div>
  );
}

export default async function AlertPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^\d+$/.test(id)) notFound();

  const alert = await apiGetOrNull<AlertDetail>(`/alerts/${id}`);
  if (!alert) notFound();
  const [lifecycle, analysts] = await Promise.all([
    apiGet<Lifecycle>(`/alerts/${id}/lifecycle`),
    apiGet<Analyst[]>("/analysts"),
  ]);

  const requested = first(sp.tab);
  const tab = (TABS as readonly string[]).includes(requested ?? "")
    ? (requested as (typeof TABS)[number])
    : "overview";

  return (
    <>
      <PageHeader
        breadcrumbs={[
          { label: "Mini SOC", href: "/soc" },
          { label: "Alerts", href: "/soc/alerts" },
          { label: `#${alert.id}` },
        ]}
        title={alert.title}
        meta={
          <>
            <SeverityBadge severity={alert.severity} />
            <AlertStatusBadge status={alert.status} />
            {alert.synthetic ? (
              <SyntheticBadge />
            ) : (
              <Badge variant="success">Live lab activity</Badge>
            )}
            {alert.technique ? (
              <TechniqueChip id={alert.technique.id} name={alert.technique.name} />
            ) : null}
            <span className="text-xs text-muted-foreground">
              <RelativeTime iso={alert.timestamp} /> · {formatDateTimeFull(alert.timestamp)}
            </span>
          </>
        }
        actions={<AlertActions alert={alert} analysts={analysts} />}
      />

      <Tabs defaultValue={tab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="lifecycle" data-testid="tab-lifecycle">
            Lifecycle
          </TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({alert.events.length})</TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">
            Notes ({alert.notes.length})
          </TabsTrigger>
          <TabsTrigger value="ai" data-testid="tab-ai">
            AI analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>What happened</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {alert.description}
                  </p>
                </CardContent>
              </Card>
              {alert.evidence.match?.length ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Matched evidence</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {alert.evidence.match.map((m, i) => (
                      <div key={i} className="rounded-md border border-border p-2.5 text-xs">
                        <p className="font-mono text-muted-foreground">
                          {m.field} <span className="text-primary">~ {m.pattern}</span>
                        </p>
                        <p className="mt-1 break-all font-mono">
                          {typeof m.value === "string" ? m.value : JSON.stringify(m.value)}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
              {alert.related_alerts.length ? (
                <section>
                  <h2 className="mb-2 text-sm font-semibold">Related alerts</h2>
                  <AlertsTable alerts={alert.related_alerts} compact />
                </section>
              ) : null}
            </div>

            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="Host">
                    <span className="font-mono">{alert.host ?? "—"}</span>
                  </Field>
                  <Field label="User">
                    <span className="font-mono">{alert.user ?? "—"}</span>
                  </Field>
                  <Field label="Source">{alert.source}</Field>
                  <Field label="Confidence">{alert.confidence}%</Field>
                  <Field label="Tactic">{alert.tactic ?? "—"}</Field>
                  <Field label="Assignee">{alert.assignee?.name ?? "Unassigned"}</Field>
                  <Field label="Rule">
                    {alert.rule ? (
                      <Link
                        href={`/detections/${alert.rule.slug}`}
                        className="break-all font-mono text-xs text-primary hover:underline"
                      >
                        {alert.rule.slug}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Field>
                  <Field label="Lab">
                    {alert.lab ? (
                      <Link
                        href={`/labs/${alert.lab.slug}`}
                        className="text-primary hover:underline"
                      >
                        Lab {String(alert.lab.number).padStart(2, "0")}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Field>
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="lifecycle">
          <LifecycleFlow data={lifecycle} initialStage="match" currentAlertId={alert.id} />
        </TabsContent>

        <TabsContent value="evidence">
          <div className="space-y-3">
            {alert.events.slice(0, 25).map((e) => (
              <Card key={e.id}>
                <CardContent className="p-3">
                  <p className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="font-mono">
                      {e.source}
                    </Badge>
                    <span>{formatDateTimeFull(e.timestamp)}</span>
                    <span>· {e.message}</span>
                  </p>
                  <CodeBlock code={e.raw} title={`event #${e.id}`} maxHeight="10rem" />
                </CardContent>
              </Card>
            ))}
            {alert.events.length > 25 ? (
              <p className="text-xs text-muted-foreground">
                Showing 25 of {alert.events.length} evidence events.
              </p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <NotesPanel
            notes={alert.notes}
            analysts={analysts}
            target={{ kind: "alert", id: alert.id }}
          />
        </TabsContent>

        <TabsContent value="ai">
          <AiAnalysisPanel alertId={alert.id} latest={alert.latest_ai_analysis} />
        </TabsContent>
      </Tabs>
    </>
  );
}
