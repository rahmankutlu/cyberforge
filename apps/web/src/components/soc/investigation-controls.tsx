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
import { useLocale } from "@/components/i18n/locale-provider";

export function InvestigationControls({
  investigation,
  analysts,
}: {
  investigation: InvestigationDetail;
  analysts: Analyst[];
}) {
  const router = useRouter();
  const { t, c } = useLocale();
  const statusLabels: Record<InvestigationStatus, string> = {
    open: t("investigationStatus.open"),
    in_progress: t("investigationStatus.inProgress"),
    contained: t("investigationStatus.contained"),
    closed: t("investigationStatus.closed"),
  };
  const severityLabels: Record<Severity, string> = {
    critical: t("severity.critical"),
    high: t("severity.high"),
    medium: t("severity.medium"),
    low: t("severity.low"),
    informational: t("severity.informational"),
  };
  const patch = useMutation({
    mutationFn: (body: { status?: InvestigationStatus; severity?: Severity; lead_id?: number }) =>
      apiSend<InvestigationDetail>("PATCH", `/investigations/${investigation.id}`, body),
    onSuccess: () => {
      toast.success(c("Investigation updated"));
      router.refresh();
    },
    onError: (error: Error) => toast.error(c("Update failed"), { description: error.message }),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label={c("Investigation status")}
        value={investigation.status}
        disabled={patch.isPending}
        className="w-40"
        onChange={(e) => patch.mutate({ status: e.target.value as InvestigationStatus })}
      >
        {INVESTIGATION_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabels[s]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={c("Investigation severity")}
        value={investigation.severity}
        disabled={patch.isPending}
        className="w-36"
        onChange={(e) => patch.mutate({ severity: e.target.value as Severity })}
      >
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {severityLabels[s]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={c("Lead analyst")}
        value={investigation.lead?.id ?? 0}
        disabled={patch.isPending}
        className="w-52"
        onChange={(e) => patch.mutate({ lead_id: Number(e.target.value) })}
      >
        <option value={0}>{c("No lead")}</option>
        {analysts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}
