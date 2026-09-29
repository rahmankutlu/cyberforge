import type { AIFinding, AISecurityOverview } from "@cyberforge/types";
import { Badge, Button, Card } from "@cyberforge/ui";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { TrustBoundaryChain } from "@/components/ai-security/trust-boundary-chain";
import { PageHeader } from "@/components/page-header";
import { apiGet } from "@/lib/api";

export const metadata = { title: "AI security" };

export default async function AiSecurityPage() {
  const [overview, findings] = await Promise.all([
    apiGet<AISecurityOverview>("/ai-security/overview"),
    apiGet<AIFinding[]>("/ai-security/findings"),
  ]);
  const byBoundary: Record<string, number> = {};
  for (const f of findings)
    if (f.boundary_id) byBoundary[f.boundary_id] = (byBoundary[f.boundary_id] ?? 0) + 1;

  return (
    <>
      <PageHeader
        title="AI security"
        description="LLM applications and agents have a different attack surface: the model cannot separate instructions from data. Learn where trust boundaries fail, using synthetic agents and sandboxed tools only."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/ai-security/labs">AI labs</Link>
            </Button>
            <Button asChild>
              <Link href="/ai-security/findings">
                Findings ({findings.length}) <ArrowRight />
              </Link>
            </Button>
          </>
        }
        meta={
          <Badge variant="outline" className="gap-1">
            <ShieldCheck className="size-3" /> No external AI services are ever attacked: the model
            is a local, deterministic stand-in
          </Badge>
        }
      />

      <section aria-labelledby="chain-title" className="mb-8">
        <h2 id="chain-title" className="mb-1 text-sm font-semibold">
          Where the trust boundaries fail
        </h2>
        <p className="mb-4 max-w-3xl text-xs text-muted-foreground">
          User → LLM → Agent → Tool → Sensitive resource. Each arrow is a boundary: select one to
          see how it breaks and which control belongs there. Numbers show findings from the AI lab
          telemetry.
        </p>
        <TrustBoundaryChain overview={overview} findingsByBoundary={byBoundary} />
      </section>

      <section aria-labelledby="topics-title">
        <h2 id="topics-title" className="mb-3 text-sm font-semibold">
          Topics
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {overview.topics.map((topic) => (
            <li key={topic.title}>
              <Card className="h-full p-4">
                <h3 className="text-[13px] font-semibold">{topic.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {topic.summary}
                </p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge variant="outline">OWASP {topic.owasp}</Badge>
                  {topic.atlas.map((a) => (
                    <Link key={a} href={`/mitre/${a}`}>
                      <Badge variant="outline" className="font-mono hover:border-primary/50">
                        {a}
                      </Badge>
                    </Link>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                  {topic.labs.map((slug) => (
                    <Link
                      key={slug}
                      href={`/labs/${slug}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {overview.labs.find((l) => l.slug === slug)?.title ?? slug}
                    </Link>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
