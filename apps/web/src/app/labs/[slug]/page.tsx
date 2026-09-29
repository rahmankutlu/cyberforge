import type { LabDetail } from "@cyberforge/types";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  TBody,
  TD,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TH,
  THead,
  TR,
} from "@cyberforge/ui";
import { CheckCircle2, ExternalLink, Lock, Network, Play, Target } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DifficultyBadge, TechniqueChip } from "@/components/badges";
import { CodeBlock, CopyButton } from "@/components/code-block";
import { LabRunner } from "@/components/labs/lab-runner";
import { PageHeader } from "@/components/page-header";
import { apiGetOrNull } from "@/lib/api";
import { formatDuration, titleCase } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const lab = await apiGetOrNull<LabDetail>(`/labs/${slug}`).catch(() => null);
  return { title: lab ? `Lab ${String(lab.number).padStart(2, "0")} · ${lab.title}` : "Lab" };
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function NumberedList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[13px] leading-relaxed">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px] tabular-nums text-muted-foreground">
            {i + 1}
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export default async function LabPage({ params }: Props) {
  const { slug } = await params;
  const lab = await apiGetOrNull<LabDetail>(`/labs/${slug}`);
  if (!lab) notFound();
  const doc = lab.document;
  const composeCommand = doc.setup.compose_profile
    ? `docker compose --profile ${doc.setup.compose_profile} up -d lab-vuln-web lab-gateway`
    : null;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Labs", href: "/labs" }, { label: `Lab ${String(lab.number).padStart(2, "0")}` }]}
        title={lab.title}
        description={lab.summary}
        meta={
          <>
            <DifficultyBadge difficulty={lab.difficulty} />
            <Badge variant="outline">{lab.category}</Badge>
            <Badge variant="outline">{titleCase(lab.domain)}</Badge>
            <Badge variant="outline">{formatDuration(lab.duration_minutes)}</Badge>
            {doc.tags.map((t) => (
              <Badge key={t} variant="neutral">{t}</Badge>
            ))}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <Tabs defaultValue="overview">
            <TabsList className="h-auto flex-wrap justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="setup">Setup &amp; telemetry</TabsTrigger>
              <TabsTrigger value="simulation">Attack simulation</TabsTrigger>
              <TabsTrigger value="detection">Detection</TabsTrigger>
              <TabsTrigger value="investigate">Investigate</TabsTrigger>
              <TabsTrigger value="defend">Mitigate &amp; cleanup</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Section title="Objectives">
                <ul className="space-y-1.5">
                  {doc.objectives.map((o) => (
                    <li key={o} className="flex gap-2 text-[13px]">
                      <Target className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      {o}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Scenario">
                <p className="text-[13px] leading-relaxed text-muted-foreground">{doc.scenario}</p>
              </Section>
              <Section title="Architecture">
                <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{doc.architecture.description}</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {doc.architecture.components.map((c) => (
                    <Card key={c.name}>
                      <CardContent className="p-3">
                        <p className="flex items-center gap-1.5 text-[13px] font-medium">
                          <Network className="size-3.5 text-muted-foreground" />
                          {c.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{c.role}</p>
                        <Badge variant="outline" className="mt-2 font-mono">{c.network}</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {doc.architecture.diagram ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Diagram source (Mermaid, renders on GitHub)</summary>
                    <CodeBlock className="mt-2" code={doc.architecture.diagram} title="architecture.mmd" maxHeight="16rem" />
                  </details>
                ) : null}
              </Section>
              <Section title="MITRE mapping">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {lab.techniques.map((t) => (
                    <TechniqueChip key={t.id} id={t.id} name={t.name} />
                  ))}
                </div>
              </Section>
              <Section title="References">
                <ul className="space-y-1">
                  {doc.references.map((r) => (
                    <li key={r.url}>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline">
                        {r.title} <ExternalLink className="size-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            </TabsContent>

            <TabsContent value="setup">
              <Section title="Lab setup">
                <NumberedList
                  items={doc.setup.steps.map((s) => (
                    <span key={s} className="[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs">
                      {s.split(/(`[^`]+`)/).map((part, i) =>
                        part.startsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>,
                      )}
                    </span>
                  ))}
                />
                {composeCommand ? (
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                    <code className="truncate font-mono text-xs">{composeCommand}</code>
                    <CopyButton text={composeCommand} />
                  </div>
                ) : null}
              </Section>
              <Section title="Telemetry sources">
                <Table>
                  <THead>
                    <TR className="hover:bg-transparent">
                      <TH>Source</TH>
                      <TH>Description</TH>
                      <TH>Sigma logsource</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {doc.telemetry.sources.map((s) => (
                      <TR key={s.name}>
                        <TD className="font-medium">{s.name}</TD>
                        <TD className="text-muted-foreground">{s.description}</TD>
                        <TD className="font-mono text-xs">{s.log_source}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
                <p className="mt-2 text-xs text-muted-foreground">
                  Scenario file: <code className="font-mono">{doc.telemetry.scenario_file}</code> · {lab.scenario_event_count} events
                </p>
              </Section>
            </TabsContent>

            <TabsContent value="simulation">
              <Section title="What the simulation does">
                <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{doc.attack_simulation.description}</p>
                <NumberedList
                  items={doc.attack_simulation.steps.map((s) => (
                    <span key={s.title}>
                      <strong className="font-medium">{s.title}.</strong> <span className="text-muted-foreground">{s.detail}</span>
                    </span>
                  ))}
                />
              </Section>
              <Section title="Safety boundary">
                <Card>
                  <CardContent className="flex gap-3 p-4">
                    <Lock className="mt-0.5 size-4 shrink-0 text-ok" />
                    <div className="text-[13px]">
                      <p>
                        Scope <Badge variant="outline" className="mx-1 font-mono">{doc.safety.scope}</Badge> · network{" "}
                        <Badge variant="outline" className="mx-1 font-mono">{doc.safety.network}</Badge>
                      </p>
                      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                        This lab only targets isolated CyberForge lab systems or synthetic data. Addresses in the telemetry are RFC 5737 documentation ranges or private space, and the API rejects any external simulation target.
                        {doc.safety.allowed_targets.length ? ` Approved lab hostnames: ${doc.safety.allowed_targets.join(", ")}.` : ""}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Section>
            </TabsContent>

            <TabsContent value="detection">
              <Section title="Expected detection">
                <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{doc.expected_detection.description}</p>
                <ul className="space-y-2">
                  {lab.rules.map((rule) => (
                    <li key={rule.slug}>
                      <Link href={`/detections/${rule.slug}`} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 transition-colors hover:border-primary/40 hover:bg-muted/30">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{rule.title}</span>
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">{rule.slug}</span>
                        </span>
                        <Badge variant={rule.level === "critical" ? "critical" : rule.level === "high" ? "high" : rule.level === "medium" ? "medium" : "low"}>{rule.level}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>
            </TabsContent>

            <TabsContent value="investigate">
              <Section title="Investigation questions">
                <ol className="space-y-3">
                  {doc.investigation_questions.map((q, i) => (
                    <li key={q.question}>
                      <p className="text-[13px] font-medium">
                        <span className="mr-2 text-muted-foreground">{i + 1}.</span>
                        {q.question}
                      </p>
                      <details className="mt-1.5 ml-5 rounded-md border border-border px-3 py-2 text-[13px]">
                        <summary className="cursor-pointer text-xs text-muted-foreground">Hint and answer</summary>
                        <p className="mt-2 text-muted-foreground"><span className="font-medium text-foreground">Hint:</span> {q.hint}</p>
                        <p className="mt-1.5"><span className="font-medium">Answer:</span> {q.answer}</p>
                      </details>
                    </li>
                  ))}
                </ol>
              </Section>
              <Button asChild variant="outline">
                <Link href="/soc/alerts"><Play /> Open the alert queue</Link>
              </Button>
            </TabsContent>

            <TabsContent value="defend">
              <Section title="Mitigation">
                <ul className="space-y-2">
                  {doc.mitigation.map((m) => (
                    <li key={m} className="flex gap-2 text-[13px]">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" />
                      {m}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Cleanup">
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                  {doc.cleanup.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </Section>
            </TabsContent>
          </Tabs>
        </div>

        <aside aria-label="Run this lab">
          <LabRunner
            slug={lab.slug}
            title={lab.title}
            expectedRules={doc.expected_detection.rules}
            requiresContainers={doc.setup.requires_containers}
            allowedTargets={doc.safety.allowed_targets}
          />
        </aside>
      </div>
    </>
  );
}
