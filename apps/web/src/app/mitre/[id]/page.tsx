import type { TechniqueDetail } from "@cyberforge/types";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@cyberforge/ui";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SeverityBadge } from "@/components/badges";
import { PageHeader } from "@/components/page-header";
import { AlertsTable } from "@/components/soc/alerts-table";
import { StatCard } from "@/components/stat-card";
import { apiGetOrNull } from "@/lib/api";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";
import { localizeContentTree } from "@/lib/i18n/content";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return { title: `${decodeURIComponent(id).toUpperCase()} · MITRE` };
}

export default async function TechniquePage({ params }: Props) {
  const locale = await getLocale();
  const c = createCopyTranslator(locale);
  const { id } = await params;
  const tech = await apiGetOrNull<TechniqueDetail>(`/mitre/techniques/${encodeURIComponent(id)}`);
  if (!tech) notFound();

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "MITRE", href: "/mitre" }, { label: tech.id }]}
        title={
          <span className="flex flex-wrap items-baseline gap-3">
            <span className="font-mono text-lg text-primary">{tech.id}</span>
            {tech.name}
          </span>
        }
        description={tech.description}
        meta={
          <>
            <Badge variant="outline" className="uppercase">
              {tech.framework}
            </Badge>
            {tech.tactics.map((t) => (
              <Badge key={t.id} variant="accent">
                {t.name}
              </Badge>
            ))}
            {tech.platforms.map((p) => (
              <Badge key={p} variant="neutral">
                {p}
              </Badge>
            ))}
            {tech.url ? (
              <a
                href={tech.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                {tech.framework === "atlas" ? "MITRE ATLAS" : "attack.mitre.org"}{" "}
                <ExternalLink className="size-3" />
              </a>
            ) : null}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="technique-stats">
        <StatCard label={c("Labs")} value={tech.labs} />
        <StatCard
          label={c("Rules")}
          value={tech.rules}
          tone={tech.rules === 0 ? "high" : undefined}
          hint={tech.rules === 0 ? c("Detection gap") : undefined}
        />
        <StatCard label={c("Alerts")} value={tech.alerts} />
        <StatCard label={c("Investigations")} value={tech.investigations} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{c("Mapped labs")}</CardTitle>
          </CardHeader>
          <CardContent>
            {tech.lab_refs.length ? (
              <ul className="space-y-1.5">
                {tech.lab_refs.map((lab) => (
                  <li key={lab.slug}>
                    <Link href={`/labs/${lab.slug}`} className="text-[13px] hover:text-primary">
                      <span className="mr-1.5 font-mono text-xs text-muted-foreground">
                        {String(lab.number).padStart(2, "0")}
                      </span>
                      {lab.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {c("No lab teaches this technique yet.")}{" "}
                <Link href="/docs/contributing-labs" className="text-primary hover:underline">
                  {c("Contribute one.")}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{c("Mapped detection rules")}</CardTitle>
          </CardHeader>
          <CardContent>
            {tech.rule_refs.length ? (
              <ul className="space-y-1.5">
                {tech.rule_refs.map((rule) => (
                  <li key={rule.slug} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/detections/${rule.slug}`}
                      className="min-w-0 truncate text-[13px] hover:text-primary"
                    >
                      {rule.title}
                    </Link>
                    <SeverityBadge severity={rule.level} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                {c("No rule detects this technique. That is a coverage gap.")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {tech.sub_techniques.length ? (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold">{c("Sub-techniques")}</h2>
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH className="w-32">{c("ID")}</TH>
                <TH>{c("Name")}</TH>
                <TH className="w-16 text-right">{c("Labs")}</TH>
                <TH className="w-16 text-right">{c("Rules")}</TH>
                <TH className="w-16 text-right">{c("Alerts")}</TH>
              </TR>
            </THead>
            <TBody>
              {tech.sub_techniques.map((s) => (
                <TR key={s.id}>
                  <TD className="font-mono text-xs">
                    <Link href={`/mitre/${s.id}`} className="text-primary hover:underline">
                      {s.id}
                    </Link>
                  </TD>
                  <TD>{s.name}</TD>
                  <TD className="text-right tabular-nums">{s.labs}</TD>
                  <TD className="text-right tabular-nums">{s.rules}</TD>
                  <TD className="text-right tabular-nums">{s.alerts}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ) : null}

      {tech.recent_alerts.length ? (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold">{c("Recent alerts")}</h2>
          <AlertsTable alerts={localizeContentTree(locale, tech.recent_alerts)} compact />
        </section>
      ) : null}

      {tech.mitigations.length ? (
        <section className="mt-5">
          <h2 className="mb-2 text-sm font-semibold">{c("MITRE mitigations")}</h2>
          <div className="grid gap-2 md:grid-cols-2">
            {tech.mitigations.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-3">
                  <p className="text-[13px] font-medium">
                    <span className="mr-1.5 font-mono text-xs text-muted-foreground">{m.id}</span>
                    {m.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{m.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
