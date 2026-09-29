"use client";

import type { Analyst, Note } from "@cyberforge/types";
import { Button, EmptyState, NativeSelect, Textarea } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { MessageSquarePlus, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { RelativeTime } from "@/components/relative-time";
import { apiSend } from "@/lib/api";
import { readStorage, writeStorage } from "@/lib/persistent-storage";

const ANALYST_KEY = "cyberforge:current-analyst";
const noop = () => () => {};

/** The demo analyst you are "acting as" is remembered locally; there are no accounts in v0.1. */
function useCurrentAnalyst(analysts: Analyst[]) {
  const stored = useSyncExternalStore(
    noop,
    () => readStorage(ANALYST_KEY),
    () => null,
  );
  const [override, setOverride] = useState<string | null>(null);
  const value = override ?? stored ?? String(analysts[0]?.id ?? "");
  return {
    value,
    set: (id: string) => {
      writeStorage(ANALYST_KEY, id);
      setOverride(id);
    },
  };
}

export function NotesPanel({
  notes,
  analysts,
  target,
}: {
  notes: Note[];
  analysts: Analyst[];
  target: { kind: "alert" | "investigation"; id: number };
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const analyst = useCurrentAnalyst(analysts);
  const path =
    target.kind === "alert" ? `/alerts/${target.id}/notes` : `/investigations/${target.id}/notes`;

  const add = useMutation({
    mutationFn: () =>
      apiSend<Note>("POST", path, {
        body,
        author_id: analyst.value ? Number(analyst.value) : null,
      }),
    onSuccess: () => {
      setBody("");
      toast.success("Note added");
      router.refresh();
    },
    onError: (error: Error) =>
      toast.error("Could not add the note", { description: error.message }),
  });

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <EmptyState
          icon={<StickyNote />}
          title="No analyst notes yet"
          description="Record what you checked and why you made a decision. Notes make triage reviewable."
        />
      ) : (
        <ol className="space-y-3" data-testid="notes-list">
          {notes.map((note) => (
            <li key={note.id} className="rounded-lg border border-border bg-card p-3">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  {note.author?.name ?? "Unknown analyst"}
                </span>
                <RelativeTime iso={note.created_at} />
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{note.body}</p>
            </li>
          ))}
        </ol>
      )}

      <form
        className="space-y-2 rounded-lg border border-border bg-card p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim()) add.mutate();
        }}
      >
        <label
          htmlFor={`note-${target.kind}-${target.id}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Add an analyst note
        </label>
        <Textarea
          id={`note-${target.kind}-${target.id}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="What did you check? What did you conclude?"
          maxLength={8000}
          rows={3}
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Acting as</span>
            <NativeSelect
              aria-label="Acting analyst"
              value={analyst.value}
              onChange={(e) => analyst.set(e.target.value)}
              className="w-52"
            >
              {analysts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" disabled={!body.trim() || add.isPending}>
            <MessageSquarePlus />
            {add.isPending ? "Adding…" : "Add note"}
          </Button>
        </div>
      </form>
    </div>
  );
}
