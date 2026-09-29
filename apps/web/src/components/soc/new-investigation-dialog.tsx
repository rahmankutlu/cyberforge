"use client";

import type { Analyst, InvestigationDetail, Severity } from "@cyberforge/types";
import { SEVERITIES } from "@cyberforge/types";
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
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { apiSend } from "@/lib/api";
import { SEVERITY_LABEL } from "@/lib/format";

export function NewInvestigationDialog({ analysts }: { analysts: Analyst[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [lead, setLead] = useState("");

  const create = useMutation({
    mutationFn: () =>
      apiSend<InvestigationDetail>("POST", "/investigations", {
        title,
        summary,
        severity,
        lead_id: lead ? Number(lead) : null,
        alert_ids: [],
      }),
    onSuccess: (inv) => {
      toast.success("Investigation created");
      setOpen(false);
      router.push(`/soc/investigations/${inv.id}`);
    },
    onError: (error: Error) =>
      toast.error("Could not create the investigation", { description: error.message }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-investigation">
          <Plus /> New investigation
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New investigation</DialogTitle>
          <DialogDescription>
            Start an empty case. You can attach alerts from the alert queue or an alert page
            afterwards.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim().length >= 3) create.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="inv-title">Title</Label>
            <Input
              id="inv-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="e.g. Suspicious logons on the bastion"
              required
              minLength={3}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="inv-summary">Summary</Label>
            <Textarea
              id="inv-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              rows={3}
              maxLength={8000}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="inv-severity">Severity</Label>
              <NativeSelect
                id="inv-severity"
                value={severity}
                onChange={(e) => setSeverity(e.target.value as Severity)}
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="inv-lead">Lead analyst</Label>
              <NativeSelect id="inv-lead" value={lead} onChange={(e) => setLead(e.target.value)}>
                <option value="">None</option>
                {analysts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={title.trim().length < 3 || create.isPending}>
              {create.isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
