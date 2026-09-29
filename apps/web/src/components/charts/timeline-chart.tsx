"use client";

import type { TimelinePoint } from "@cyberforge/types";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SERIES = [
  { key: "critical", label: "Critical", color: "var(--sev-critical)" },
  { key: "high", label: "High", color: "var(--sev-high)" },
  { key: "medium", label: "Medium", color: "var(--sev-medium)" },
  { key: "low", label: "Low", color: "var(--sev-low)" },
] as const;

const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const stamp = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

interface TooltipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; payload: TimelinePoint }[];
}

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0]!.payload;
  return (
    <div className="rounded-md border border-border bg-popover px-2.5 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{stamp.format(new Date(point.bucket))} UTC</p>
      {SERIES.map((s) => (
        <p key={s.key} className="flex items-center justify-between gap-6 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="tabular-nums text-foreground">{point[s.key]}</span>
        </p>
      ))}
      <p className="mt-1 border-t border-border pt-1 text-muted-foreground">
        Events processed: <span className="tabular-nums text-foreground">{point.events}</span>
      </p>
    </div>
  );
}

export default function TimelineChart({ data }: { data: TimelinePoint[] }) {
  return (
    <div
      className="h-56 w-full"
      role="img"
      aria-label="Alerts over the last seven days, stacked by severity"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 6, right: 4, bottom: 0, left: -18 }}
          barCategoryGap={2}
        >
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="bucket"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickFormatter={(v: string) =>
              new Date(v).getUTCHours() === 0 ? day.format(new Date(v)) : ""
            }
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.5 }} />
          {SERIES.map((s) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="alerts"
              fill={s.color}
              radius={0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
