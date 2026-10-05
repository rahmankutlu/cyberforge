"use client";

import type { TimelineEntry } from "@cyberforge/types";
import { Button, EmptyState, Input, NativeSelect, Textarea, cn } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import {
  Eye,
  FileSearch,
  Flag,
  Radar,
  ShieldCheck,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { apiSend } from "@/lib/api";
import { formatDateTimeFull } from "@/lib/format";
import { useLocale } from "@/components/i18n/locale-provider";

const KINDS: Record<TimelineEntry["kind"], { label: string; icon: LucideIcon; tone: string }> = {
  detection: { label: "Detection", icon: Radar, tone: "text-sev-high" },
  evidence: { label: "Evidence", icon: FileSearch, tone: "text-primary" },
  containment: { label: "Containment", icon: ShieldCheck, tone: "text-ok" },
  note: { label: "Note", icon: StickyNote, tone: "text-muted-foreground" },
  status: { label: "Status", icon: Flag, tone: "text-muted-foreground" },
};

export function TimelinePanel({
  investigationId,
  entries,
}: {
  investigationId: number;
  entries: TimelineEntry[];
}) {
  const router = useRouter();
  const { c, locale } = useLocale();
  const [kind, setKind] = useState<TimelineEntry["kind"]>("note");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");

  const add = useMutation({
    mutationFn: () =>
      apiSend<TimelineEntry>("POST", `/investigations/${investigationId}/timeline`, {
        kind,
        title,
        detail,
      }),
    onSuccess: () => {
      setTitle("");
      setDetail("");
      toast.success(c("Timeline entry added"));
      router.refresh();
    },
    onError: (error: Error) =>
      toast.error(c("Could not add the entry"), { description: error.message }),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      {entries.length === 0 ? (
        <EmptyState
          icon={<Eye />}
          title={c("The timeline is empty")}
          description={c(
            "Add the key moments of the incident in order: detection, evidence, containment.",
          )}
        />
      ) : (
        <ol className="relative space-y-4 border-l border-border pl-6" data-testid="timeline">
          {entries.map((entry) => {
            const meta = KINDS[entry.kind];
            return (
              <li key={entry.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[33px] flex size-6 items-center justify-center rounded-full border border-border bg-card",
                    meta.tone,
                  )}
                >
                  <meta.icon className="size-3.5" />
                </span>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {formatDateTimeFull(entry.timestamp, locale)} ·{" "}
                  {c(meta.label as "Detection" | "Evidence" | "Containment" | "Note" | "Status")}
                </p>
                <p className="mt-0.5 text-[13px] font-medium">{entry.title}</p>
                {entry.detail ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <form
        className="h-fit space-y-2 rounded-lg border border-border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) add.mutate();
        }}
      >
        <p className="text-xs font-medium text-muted-foreground">{c("Add a timeline entry")}</p>
        <NativeSelect
          aria-label={c("Entry type")}
          value={kind}
          onChange={(e) => setKind(e.target.value as TimelineEntry["kind"])}
        >
          {Object.entries(KINDS).map(([k, v]) => (
            <option key={k} value={k}>
              {c(v.label as "Detection" | "Evidence" | "Containment" | "Note" | "Status")}
            </option>
          ))}
        </NativeSelect>
        <Input
          aria-label={c("Entry title")}
          placeholder={c("What happened?")}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
        />
        <Textarea
          aria-label={c("Entry detail")}
          placeholder={c("Details (optional)")}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          rows={3}
          maxLength={4000}
        />
        <Button type="submit" className="w-full" disabled={!title.trim() || add.isPending}>
          {c("Add entry")}
        </Button>
      </form>
    </div>
  );
}
