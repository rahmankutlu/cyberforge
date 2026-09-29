"use client";

import type { Indicator, IndicatorType } from "@cyberforge/types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  NativeSelect,
  Textarea,
} from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { apiSend } from "@/lib/api";

const TYPES: IndicatorType[] = ["ip", "domain", "url", "sha256", "email", "cve", "asn"];

export function ImportIndicatorDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<IndicatorType>("ip");
  const [value, setValue] = useState("");
  const [tags, setTags] = useState("");
  const [confidence, setConfidence] = useState(50);
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiSend<Indicator>("POST", "/indicators", {
        type,
        value,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        confidence,
        notes,
        source: "manual import",
      }),
    onSuccess: (ind) => {
      toast.success("Indicator imported", { description: `${ind.type}: ${ind.value}` });
      setOpen(false);
      setValue("");
      setTags("");
      setNotes("");
      router.refresh();
    },
    onError: (error: Error) =>
      toast.error("Could not import the indicator", { description: error.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="import-indicator">
          <Upload /> Import indicator
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import an indicator</DialogTitle>
          <DialogDescription>
            Stored on this instance only. CyberForge never sends indicators, or your telemetry, to
            any third-party service.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) create.mutate();
          }}
        >
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div className="space-y-1">
              <Label htmlFor="ind-type">Type</Label>
              <NativeSelect
                id="ind-type"
                value={type}
                onChange={(e) => setType(e.target.value as IndicatorType)}
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ind-value">Value</Label>
              <Input
                id="ind-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="203.0.113.10"
                className="font-mono"
                spellCheck={false}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div className="space-y-1">
              <Label htmlFor="ind-tags">Tags (comma separated)</Label>
              <Input
                id="ind-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="phishing, campaign-x"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ind-conf">Confidence</Label>
              <Input
                id="ind-conf"
                type="number"
                min={0}
                max={100}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ind-notes">Notes</Label>
            <Textarea
              id="ind-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={4000}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!value.trim() || create.isPending}>
              {create.isPending ? "Importing…" : "Import"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
