"use client";

import type { AISecurityOverview, TrustBoundary } from "@cyberforge/types";
import { Badge, Card, CardContent, cn } from "@cyberforge/ui";
import {
  ArrowDown,
  Bot,
  Brain,
  Database,
  FileText,
  ShieldAlert,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";

const NODE_ICON: Record<string, LucideIcon> = {
  user: User,
  content: FileText,
  llm: Brain,
  agent: Bot,
  tool: Wrench,
  resource: Database,
};

function NodeCard({
  node,
  className,
}: {
  node: AISecurityOverview["nodes"][number];
  className?: string;
}) {
  const Icon = NODE_ICON[node.id] ?? Bot;
  return (
    <div
      className={cn(
        "flex w-full max-w-xs items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2.5",
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{node.label}</span>
        <span className="line-clamp-2 block text-[11px] leading-snug text-muted-foreground">
          {node.description}
        </span>
      </span>
    </div>
  );
}

function BoundaryPill({
  boundary,
  count,
  selected,
  onSelect,
  className,
}: {
  boundary: TrustBoundary | undefined;
  count: number;
  selected: boolean;
  onSelect: (id: string) => void;
  className?: string;
}) {
  if (!boundary) return null;
  return (
    <button
      type="button"
      onClick={() => onSelect(boundary.id)}
      aria-pressed={selected}
      data-boundary={boundary.id}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/12 text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
        className,
      )}
    >
      <ShieldAlert
        className={cn("size-3", count > 0 ? "text-sev-high" : "text-muted-foreground")}
      />
      {boundary.title}
      {count > 0 ? (
        <Badge variant="high" className="ml-0.5 px-1 py-0">
          {count}
        </Badge>
      ) : null}
    </button>
  );
}

/**
 * User → LLM → Agent → Tool → Sensitive resource, with retrieved content feeding the LLM.
 * Each arrow is a trust boundary: select one to see how it fails and which control belongs there.
 */
export function TrustBoundaryChain({
  overview,
  findingsByBoundary,
}: {
  overview: AISecurityOverview;
  findingsByBoundary: Record<string, number>;
}) {
  const { c } = useLocale();
  const [selected, setSelected] = useState<string>("context");
  const node = (id: string) => overview.nodes.find((n) => n.id === id);
  const boundary = (id: string): TrustBoundary | undefined =>
    overview.boundaries.find((b) => b.id === id);
  const active = boundary(selected);

  const pill = (id: string, className?: string) => (
    <BoundaryPill
      boundary={boundary(id)}
      count={findingsByBoundary[id] ?? 0}
      selected={selected === id}
      onSelect={setSelected}
      className={className}
    />
  );
  const arrow = <ArrowDown className="size-4 text-muted-foreground/60" aria-hidden />;

  // Spine below the LLM: each entry pairs a node with the boundary leading *into* it.
  const spine: { nodeId: string; via: string }[] = [
    { nodeId: "agent", via: "decision" },
    { nodeId: "tool", via: "tool" },
    { nodeId: "resource", via: "resource" },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
      <div
        className="flex flex-col items-center gap-0"
        role="group"
        aria-label={c("Agent trust boundary chain")}
      >
        <div className="grid w-full grid-cols-2 gap-3">
          {(["user", "content"] as const).map((id) => {
            const n = node(id);
            const via = id === "user" ? "prompt" : "context";
            return n ? (
              <div key={id} className="flex flex-col items-center">
                <NodeCard node={n} className="h-full" />
                {arrow}
                {pill(via, "my-0.5")}
                {arrow}
              </div>
            ) : null;
          })}
        </div>
        {node("llm") ? <NodeCard node={node("llm")!} /> : null}
        {spine.map(({ nodeId, via }) => {
          const n = node(nodeId);
          return n ? (
            <div key={nodeId} className="flex w-full flex-col items-center">
              {arrow}
              {pill(via, "my-0.5")}
              {arrow}
              <NodeCard node={n} />
            </div>
          ) : null;
        })}
      </div>

      <Card className="h-fit lg:sticky lg:top-20" aria-live="polite" data-testid="boundary-detail">
        {active ? (
          <CardContent className="space-y-4 p-5">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {node(active.from_node)?.label} → {node(active.to_node)?.label}
              </p>
              <h3 className="mt-0.5 text-base font-semibold">{active.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
                {active.description}
              </p>
            </div>
            <div>
              <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-sev-high">
                {c("Where the boundary fails")}
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-[13px]">
                {active.failure_modes.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ok">
                {c("Controls that belong here")}
              </h4>
              <ul className="list-disc space-y-1 pl-5 text-[13px]">
                {active.controls.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {c("Detections")}
              </h4>
              {active.rules.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {active.rules.map((r) => (
                    <Link key={r} href={`/detections/${r}`}>
                      <Badge variant="outline" className="font-mono hover:border-primary/50">
                        {r}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {c(
                    "No detection rule yet: this boundary is enforced by design (approvals, structured output), not by log matching.",
                  )}
                </p>
              )}
            </div>
            <Link
              href="/ai-security/findings"
              className="inline-block text-xs text-primary hover:underline"
            >
              {findingsByBoundary[active.id] ?? 0} {c("finding")} {c("at this boundary")}
            </Link>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
