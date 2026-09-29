"use client";

import type {
  Analyst,
  InvestigationDetail,
  InvestigationStatus,
  Severity,
} from "@cyberforge/types";
import { INVESTIGATION_STATUSES, SEVERITIES } from "@cyberforge/types";
import { NativeSelect } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { apiSend } from "@/lib/api";
import { INVESTIGATION_STATUS_LABEL, SEVERITY_LABEL } from "@/lib/format";

export function InvestigationControls({
  investigation,
  analysts,
}: {
  investigation: InvestigationDetail;
  analysts: Analyst[];
}) {
  const router = useRouter();
  const patch = useMutation({
    mutationFn: (body: { status?: InvestigationStatus; severity?: Severity; lead_id?: number }) =>
      apiSend<InvestigationDetail>("PATCH", `/investigations/${investigation.id}`, body),
    onSuccess: () => {
      toast.success("Investigation updated");
      router.refresh();
    },
    onError: (error: Error) => toast.error("Update failed", { description: error.message }),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label="Investigation status"
        value={investigation.status}
        disabled={patch.isPending}
        className="w-40"
        onChange={(e) => patch.mutate({ status: e.target.value as InvestigationStatus })}
      >
        {INVESTIGATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {INVESTIGATION_STATUS_LABEL[s]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Investigation severity"
        value={investigation.severity}
        disabled={patch.isPending}
        className="w-36"
        onChange={(e) => patch.mutate({ severity: e.target.value as Severity })}
      >
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {SEVERITY_LABEL[s]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Lead analyst"
        value={investigation.lead?.id ?? 0}
        disabled={patch.isPending}
        className="w-52"
        onChange={(e) => patch.mutate({ lead_id: Number(e.target.value) })}
      >
        <option value={0}>No lead</option>
        {analysts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
