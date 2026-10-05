"use client";

import type { GraphNodeType, StoryStep } from "@cyberforge/types";
import { cn } from "@cyberforge/ui";
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bell,
  Crosshair,
  Globe,
  Grid3x3,
  Network,
  Server,
  Terminal,
  User,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useMemo } from "react";
import { localizeKnownCopy } from "@/lib/i18n/copy";
import { useLocale } from "@/components/i18n/locale-provider";

import {
  buildGraph,
  describeEdges,
  graphHeight,
  LANE_LABEL,
  type PlacedNode,
} from "@/lib/graph-layout";

const STYLE: Record<GraphNodeType, { icon: LucideIcon; label: string; tone: string }> = {
  user: { icon: User, label: "User", tone: "border-primary/60 text-primary" },
  host: { icon: Server, label: "Host", tone: "border-foreground/40 text-foreground" },
  process: { icon: Terminal, label: "Process", tone: "border-sev-medium/60 text-sev-medium" },
  ip: { icon: Network, label: "IP", tone: "border-sev-low/60 text-sev-low" },
  domain: { icon: Globe, label: "Domain", tone: "border-sev-low/60 text-sev-low" },
  detection: { icon: Crosshair, label: "Detection", tone: "border-ok/60 text-ok" },
  alert: { icon: Bell, label: "Alert", tone: "border-sev-high/60 text-sev-high" },
  technique: {
    icon: Grid3x3,
    label: "ATT&CK",
    tone: "border-dashed border-primary/60 text-primary",
  },
};

type NodeData = { label: string; type: GraphNodeType; fresh: boolean };

function StoryNode({ data }: NodeProps<Node<NodeData>>) {
  const { locale } = useLocale();
  const style = STYLE[data.type];
  const Icon = style.icon;
  return (
    <div
      className={cn(
        "flex w-[156px] items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 text-[11px] leading-tight shadow-sm",
        style.tone,
        data.fresh && "ring-2 ring-primary/40",
      )}
      title={`${localizeKnownCopy(locale, style.label)}: ${data.label}`}
    >
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-border" />
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 break-words text-foreground">{data.label}</span>
      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border" />
    </div>
  );
}

const NODE_TYPES = { story: StoryNode };

/**
 * The investigation so far as a graph: actors and hosts on the left, then activity, the
 * detections that saw it, the alerts they raised and the ATT&CK techniques they map to.
 * It grows as steps are revealed; the newest additions are ringed. A text version follows.
 */
export function AttackGraph({ steps, className }: { steps: StoryStep[]; className?: string }) {
  const { locale, c } = useLocale();
  const { resolvedTheme } = useTheme();
  const { nodes, edges } = useMemo(() => buildGraph(steps), [steps]);
  const latest = steps.length - 1;
  // Relationship labels for every edge get noisy fast: label the newest step, and small graphs fully.
  const labelAll = edges.length <= 14;

  const flowNodes: Node<NodeData>[] = useMemo(
    () =>
      nodes.map((n: PlacedNode) => ({
        id: n.id,
        type: "story",
        position: { x: n.x, y: n.y },
        data: { label: n.label, type: n.type, fresh: n.step === latest && steps.length > 1 },
        draggable: false,
        selectable: false,
      })),
    [nodes, latest, steps.length],
  );
  const flowEdges: Edge[] = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: labelAll || e.step === latest ? e.relation : undefined,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
        style: { strokeWidth: e.step === latest && steps.length > 1 ? 2 : 1.25 },
        labelStyle: { fontSize: 10 },
        labelBgPadding: [4, 2] as [number, number],
        selectable: false,
      })),
    [edges, latest, steps.length, labelAll],
  );
  const text = useMemo(() => describeEdges(nodes, edges), [nodes, edges]);

  return (
    <section className={className} aria-label={c("Investigation graph")} data-testid="attack-graph">
      <div
        className="overflow-hidden rounded-lg border border-border bg-card"
        style={{ height: graphHeight(nodes) }}
        role="group"
        aria-label={c("Graph of {{entities}} entities, {{relationships}} relationships", {
          entities: nodes.length,
          relationships: edges.length,
        })}
      >
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={NODE_TYPES}
          colorMode={resolvedTheme === "light" ? "light" : "dark"}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.3}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnScroll={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} />
          <Controls showInteractive={false} position="bottom-right" />
        </ReactFlow>
      </div>
      <ul
        className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
        aria-label={c("Legend")}
      >
        {(Object.keys(STYLE) as GraphNodeType[]).map((t) => {
          const { icon: Icon, label } = STYLE[t];
          return (
            <li key={t} className="inline-flex items-center gap-1">
              <Icon className="size-3" aria-hidden /> {localizeKnownCopy(locale, label)}
            </li>
          );
        })}
        <li className="ml-auto hidden md:block">{LANE_LABEL.join("  →  ")}</li>
      </ul>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          {c("Relationships as text")} ({text.length})
        </summary>
        <ul
          className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted-foreground"
          data-testid="graph-text"
        >
          {text.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
