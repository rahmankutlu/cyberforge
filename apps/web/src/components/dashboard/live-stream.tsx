"use client";

import type { Severity, StreamEvent } from "@cyberforge/types";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from "@cyberforge/ui";
import { Pause, Play, Radio } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SeverityBadge } from "@/components/badges";
import { clock, parseStreamEvent, pushEvent } from "@/lib/live-stream";

type Status = "connecting" | "live" | "reconnecting";

/**
 * A lightweight live feed of synthetic events over Server-Sent Events (no WebSocket, no library).
 * The browser reconnects by itself; pausing closes the connection so nothing runs in the
 * background.
 */
export function LiveStream() {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<Status>("connecting");

  useEffect(() => {
    if (paused) return;
    const offset = Math.floor(Math.random() * 100_000);
    const source = new EventSource(`/api/v1/stream/events?rate=1.4&offset=${offset}`);
    source.addEventListener("telemetry", (message) => {
      const event = parseStreamEvent((message as MessageEvent<string>).data);
      if (!event) return;
      setStatus("live");
      setEvents((current) => pushEvent(current, event));
    });
    source.onerror = () => setStatus("reconnecting");
    return () => source.close();
  }, [paused]);

  const label = paused ? "paused" : status;

  return (
    <Card className="xl:col-span-2" data-testid="live-stream" data-status={label}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Radio className="size-4 text-primary" aria-hidden /> Live event stream
          </CardTitle>
          <CardDescription>
            Synthetic telemetry replayed over Server-Sent Events, with the rule that matched.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] capitalize text-muted-foreground" role="status">
            {label}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPaused((p) => !p);
              setStatus("connecting");
            }}
            data-testid="stream-toggle"
            aria-label={paused ? "Resume live stream" : "Pause live stream"}
          >
            {paused ? <Play /> : <Pause />}
            {paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed text-xs">
            <caption className="sr-only">Most recent synthetic events, newest first</caption>
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="w-[4.5rem] px-2 py-1.5">
                  Time
                </th>
                <th scope="col" className="w-[6rem] px-2 py-1.5">
                  Source
                </th>
                <th scope="col" className="w-[6.5rem] px-2 py-1.5">
                  Host
                </th>
                <th scope="col" className="w-[7rem] px-2 py-1.5">
                  Event type
                </th>
                <th scope="col" className="px-2 py-1.5">
                  Rule
                </th>
                <th scope="col" className="w-[5.5rem] px-2 py-1.5">
                  Severity
                </th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                    {paused ? "Paused." : "Connecting to the stream…"}
                  </td>
                </tr>
              ) : null}
              {events.map((e) => (
                <tr
                  key={e.seq}
                  data-testid="stream-row"
                  data-severity={e.severity}
                  className={cn(
                    "border-b border-border/60 last:border-0 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300",
                    e.rule && "bg-sev-high/6",
                  )}
                >
                  <td className="px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                    {clock(e.timestamp)}
                  </td>
                  <td className="truncate px-2 py-1.5">{e.source ?? "-"}</td>
                  <td className="truncate px-2 py-1.5 font-mono text-[11px]">{e.host}</td>
                  <td className="truncate px-2 py-1.5 text-muted-foreground">
                    {e.event_type.replace(/_/g, " ")}
                  </td>
                  <td className="truncate px-2 py-1.5">
                    {e.rule && e.rule_slug ? (
                      <Link
                        href={`/detections/${e.rule_slug}`}
                        className="hover:text-primary hover:underline"
                        title={e.rule}
                      >
                        {e.rule}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground" title={e.message}>
                        {e.message || "no rule matched"}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {e.rule ? (
                      <SeverityBadge severity={e.severity as Severity} />
                    ) : (
                      <span className="text-muted-foreground">normal</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
