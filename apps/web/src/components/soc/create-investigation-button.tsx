"use client";

import type { InvestigationDetail, Severity } from "@cyberforge/types";
import { Button } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { apiSend } from "@/lib/api";

/** Opens an investigation seeded with this alert, then jumps to it. */
export function CreateInvestigationButton({
  alertId,
  defaultTitle,
  severity,
}: {
  alertId: number;
  defaultTitle: string;
  severity: Severity;
}) {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: () =>
      apiSend<InvestigationDetail>("POST", "/investigations", {
        title: `Investigation: ${defaultTitle}`.slice(0, 200),
        summary: "",
        severity,
        alert_ids: [alertId],
      }),
    onSuccess: (inv) => {
      toast.success("Investigation created", { description: `#${inv.id} · ${inv.title}` });
      router.push(`/soc/investigations/${inv.id}`);
    },
    onError: (error: Error) =>
      toast.error("Could not create the investigation", { description: error.message }),
  });

  return (
    <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      <FolderPlus />
      {mutation.isPending ? "Creating…" : "Create investigation"}
    </Button>
  );
}
