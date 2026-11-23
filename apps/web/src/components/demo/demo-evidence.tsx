"use client";

import type { DemoAlert, DemoEvent, Severity } from "@cyberforge/types";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@cyberforge/ui";
import { ArrowUpRight, X } from "lucide-react";
import Link from "next/link";

import { SeverityBadge } from "@/components/badges";
import { CodeBlock, CopyButton } from "@/components/code-block";
import { useLocale } from "@/components/i18n/locale-provider";

export function DemoEvidence({
  event,
  alerts,
  time,
  copyLink,
  onClose,
  restoreFocus,
}: {
  event: DemoEvent;
  alerts: DemoAlert[];
  time: string;
  copyLink: () => string;
  onClose: () => void;
  restoreFocus: () => void;
}) {
  const { c } = useLocale();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        hideClose
        className="top-1/2 max-h-[calc(100dvh-2rem)] max-w-2xl -translate-y-1/2 overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base">{c("Event evidence")}</DialogTitle>
          <DialogDescription className="break-words">{event.message}</DialogDescription>
        </DialogHeader>
        <DialogClose asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-3 right-3"
            aria-label={c("Close evidence")}
          >
            <X />
          </Button>
        </DialogClose>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
          {[
            [c("Time"), time],
            [c("Host"), event.host ?? "—"],
            [c("Source"), event.source],
            [c("Event type"), event.category],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0 bg-card px-2.5 py-2">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 break-words font-mono text-xs">{value}</dd>
            </div>
          ))}
        </dl>

        <Tabs defaultValue="raw">
          <TabsList aria-label={c("Evidence views")}>
            <TabsTrigger value="raw">{c("Raw event")}</TabsTrigger>
            <TabsTrigger value="parsed">{c("Parsed fields")}</TabsTrigger>
          </TabsList>
          <TabsContent value="raw">
            <CodeBlock title={c("Raw event")} code={event.raw} maxHeight="12rem" wrap />
          </TabsContent>
          <TabsContent value="parsed">
            <CodeBlock
              title={c("Parsed fields")}
              code={JSON.stringify(event.fields, null, 2)}
              maxHeight="12rem"
              wrap
            />
          </TabsContent>
        </Tabs>
        {event.note ? (
          <p className="break-words text-xs text-muted-foreground">{event.note}</p>
        ) : null}

        <section aria-labelledby="demo-rules-h" className="min-w-0">
          <h3 id="demo-rules-h" className="text-xs font-semibold">
            {c("Matching rules")}
          </h3>
          {event.detections.length ? (
            <ul className="mt-1.5 divide-y divide-border rounded-lg border border-border">
              {event.detections.map((rule) => {
                const alert = alerts.find((item) => item.rule === rule);
                return (
                  <li
                    key={rule}
                    className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 py-2 text-xs"
                  >
                    <Link
                      href={`/detections/${rule}`}
                      className="inline-flex min-w-0 items-center gap-1 break-all text-primary hover:underline"
                    >
                      {alert?.title ?? rule}{" "}
                      <ArrowUpRight className="size-3 shrink-0" aria-hidden />
                    </Link>
                    {alert ? (
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {alert.id}
                        </span>
                        <SeverityBadge severity={alert.severity as Severity} />
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {c("No detection matched this event.")}
            </p>
          )}
        </section>
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-2">
          <CopyButton text={copyLink} label={c("Copy evidence link")} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
