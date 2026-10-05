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
import { useLocale } from "@/components/i18n/locale-provider";
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
  const { t } = useLocale();

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

  const label = paused ? t("stream.paused") : t(`stream.${status}`);

  return (
    <Card className="xl:col-span-2" data-testid="live-stream" data-status={label}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Radio className="size-4 text-primary" aria-hidden /> {t("stream.title")}
          </CardTitle>
          <CardDescription>{t("stream.description")}</CardDescription>
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
            aria-label={paused ? t("stream.resumeAria") : t("stream.pauseAria")}
          >
            {paused ? <Play /> : <Pause />}
            {paused ? t("stream.resume") : t("stream.pause")}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full table-fixed text-xs">
            <caption className="sr-only">{t("stream.caption")}</caption>
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="w-[4.5rem] px-2 py-1.5">
                  {t("stream.time")}
                </th>
                <th scope="col" className="w-[6rem] px-2 py-1.5">
                  {t("stream.source")}
                </th>
                <th scope="col" className="w-[6.5rem] px-2 py-1.5">
                  {t("stream.host")}
                </th>
                <th scope="col" className="w-[7rem] px-2 py-1.5">
                  {t("stream.eventType")}
                </th>
                <th scope="col" className="px-2 py-1.5">
                  {t("stream.rule")}
                </th>
                <th scope="col" className="w-[5.5rem] px-2 py-1.5">
                  {t("stream.severity")}
                </th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-8 text-center text-muted-foreground">
                    {paused ? t("stream.pausedMessage") : t("stream.connectingMessage")}
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
                        {e.message || t("stream.noRule")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {e.rule ? (
                      <SeverityBadge severity={e.severity as Severity} />
                    ) : (
                      <span className="text-muted-foreground">{t("stream.normal")}</span>
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
