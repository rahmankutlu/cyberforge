"use client";

import type { Analyst, AlertDetail, AlertStatus } from "@cyberforge/types";
import { ALERT_STATUSES } from "@cyberforge/types";
import { Button, NativeSelect } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { CreateInvestigationButton } from "@/components/soc/create-investigation-button";
import { apiSend } from "@/lib/api";
import { useLocale } from "@/components/i18n/locale-provider";
import { localizeKnownCopy } from "@/lib/i18n/copy";

/** Status, assignee and investigation controls for one alert. Every change is a small PATCH. */
export function AlertActions({ alert, analysts }: { alert: AlertDetail; analysts: Analyst[] }) {
  const { locale, t, c } = useLocale();
  const router = useRouter();
  const statusLabels: Record<AlertStatus, string> = {
    new: t("alertStatus.new"),
    investigating: t("alertStatus.investigating"),
    contained: t("alertStatus.contained"),
    resolved: t("alertStatus.resolved"),
    false_positive: t("alertStatus.falsePositive"),
  };
  const patch = useMutation({
    mutationFn: (body: { status?: AlertStatus; assignee_id?: number }) =>
      apiSend<AlertDetail>("PATCH", `/alerts/${alert.id}`, body),
    onSuccess: (updated, vars) => {
      toast.success(
        vars.status
          ? c("Status set to {{status}}", { status: statusLabels[updated.status] })
          : updated.assignee
            ? c("Assigned to {{name}}", { name: updated.assignee.name })
            : c("Unassigned"),
      );
      router.refresh();
    },
    onError: (error: Error) => toast.error(c("Update failed"), { description: error.message }),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label={c("Alert status")}
        value={alert.status}
        onChange={(e) => patch.mutate({ status: e.target.value as AlertStatus })}
        disabled={patch.isPending}
        className="w-40"
        data-testid="status-select"
      >
        {ALERT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabels[s]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={c("Assignee")}
        value={alert.assignee?.id ?? 0}
        onChange={(e) => patch.mutate({ assignee_id: Number(e.target.value) })}
        disabled={patch.isPending}
        className="w-48"
        data-testid="assignee-select"
      >
        <option value={0}>{c("Unassigned")}</option>
        {analysts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {localizeKnownCopy(locale, a.role)}
          </option>
        ))}
      </NativeSelect>
      {alert.investigation ? (
        <Button asChild variant="outline">
          <Link href={`/soc/investigations/${alert.investigation.id}`}>
            <FolderOpen /> {c("Investigation")} #{alert.investigation.id}
          </Link>
        </Button>
      ) : (
        <CreateInvestigationButton
          alertId={alert.id}
          defaultTitle={alert.title}
          severity={alert.severity}
        />
      )}
    </div>
  );
}
