import type { RuleDetail, RuleTests } from "@cyberforge/types";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@cyberforge/ui";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FormatBadge, SeverityBadge, TechniqueChip } from "@/components/badges";
import { CodeBlock } from "@/components/code-block";
import { RuleActions } from "@/components/detections/rule-actions";
import { QualityCard, RuleTestsCard } from "@/components/detections/rule-quality";
import { PageHeader } from "@/components/page-header";
import { apiGetOrNull } from "@/lib/api";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const rule = await apiGetOrNull<RuleDetail>(`/detections/${id}`).catch(() => null);
  return { title: rule?.title ?? "Detection rule" };
}

export default async function RulePage({ params }: Props) {
  const { id } = await params;
  const rule = await apiGetOrNull<RuleDetail>(`/detections/${id}`);
  if (!rule) notFound();
  const tests = rule.format === "sigma" ? await apiGetOrNull<RuleTests>(`/detections/${id}/tests`) : null;
  const language = rule.format === "sigma" ? "sigma.yml" : rule.format === "yara" ? "rule.yar" : "suricata.rules";

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Detections", href: "/detections" }, { label: rule.title }]}
        title={rule.title}
        description={rule.description ? rule.description.replace(/\s+/g, " ") : undefined}
        meta={
          <>
            <FormatBadge format={rule.format} />
            <SeverityBadge severity={rule.level} />
            <Badge variant="outline" className="capitalize">{rule.status}</Badge>
            {rule.is_correlation ? <Badge variant="accent">correlation</Badge> : null}
            {rule.enabled ? <Badge variant="success">enabled</Badge> : <Badge variant="warning">disabled</Badge>}
            {rule.origin === "user" ? <Badge variant="outline">yours</Badge> : null}
          </>
        }
        actions={<RuleActions rule={rule} />}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <CodeBlock code={rule.content} title={language} maxHeight="34rem" />
          {tests ? <RuleTestsCard tests={tests} /> : null}
          <Card>
            <CardHeader><CardTitle>Potential false positives</CardTitle></CardHeader>
            <CardContent>
              {rule.false_positives.length ? (
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                  {rule.false_positives.map((f) => <li key={f}>{f}</li>)}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">None documented.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {tests?.quality ? <QualityCard quality={tests.quality} /> : null}
          <Card>
            <CardHeader><CardTitle>MITRE mapping</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {rule.techniques.length ? rule.techniques.map((t) => <TechniqueChip key={t.id} id={t.id} name={t.name} />) : <p className="text-xs text-muted-foreground">No techniques mapped.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Exercised by labs</CardTitle></CardHeader>
            <CardContent>
              {rule.labs.length ? (
                <ul className="space-y-1.5">
                  {rule.labs.map((lab) => (
                    <li key={lab.slug}>
                      <Link href={`/labs/${lab.slug}`} className="text-[13px] hover:text-primary">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{String(lab.number).padStart(2, "0")}</span>
                        {lab.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">No lab declares this rule.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent alerts ({rule.alert_count})</CardTitle></CardHeader>
            <CardContent>
              {rule.recent_alert_ids.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {rule.recent_alert_ids.map((aid) => (
                    <Link key={aid} href={`/soc/alerts/${aid}`}>
                      <Badge variant="outline" className="font-mono hover:border-primary/50">#{aid}</Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">This rule has not fired yet.</p>
              )}
            </CardContent>
          </Card>
          {rule.references.length ? (
            <Card>
              <CardHeader><CardTitle>References</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {rule.references.map((r) => (
                    <li key={r}>
                      <a href={r} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 break-all text-xs text-primary hover:underline">
                        {r.replace(/^https?:\/\//, "")} <ExternalLink className="size-3 shrink-0" />
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            Source: <span className="font-mono">{rule.source_path}</span> · author {rule.author}
          </p>
        </div>
      </div>
    </>
  );
}
