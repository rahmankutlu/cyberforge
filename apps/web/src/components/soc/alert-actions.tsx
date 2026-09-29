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
import { ALERT_STATUS_LABEL } from "@/lib/format";

/** Status, assignee and investigation controls for one alert. Every change is a small PATCH. */
export function AlertActions({ alert, analysts }: { alert: AlertDetail; analysts: Analyst[] }) {
  const router = useRouter();
  const patch = useMutation({
    mutationFn: (body: { status?: AlertStatus; assignee_id?: number }) =>
      apiSend<AlertDetail>("PATCH", `/alerts/${alert.id}`, body),
    onSuccess: (updated, vars) => {
      toast.success(
        vars.status
          ? `Status set to ${ALERT_STATUS_LABEL[updated.status]}`
          : updated.assignee
            ? `Assigned to ${updated.assignee.name}`
            : "Unassigned",
      );
      router.refresh();
    },
    onError: (error: Error) => toast.error("Update failed", { description: error.message }),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label="Alert status"
        value={alert.status}
        onChange={(e) => patch.mutate({ status: e.target.value as AlertStatus })}
        disabled={patch.isPending}
        className="w-40"
        data-testid="status-select"
      >
        {ALERT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {ALERT_STATUS_LABEL[s]}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Assignee"
        value={alert.assignee?.id ?? 0}
        onChange={(e) => patch.mutate({ assignee_id: Number(e.target.value) })}
        disabled={patch.isPending}
        className="w-48"
        data-testid="assignee-select"
      >
        <option value={0}>Unassigned</option>
        {analysts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} · {a.role}
          </option>
        ))}
      </NativeSelect>
      {alert.investigation ? (
        <Button asChild variant="outline">
          <Link href={`/soc/investigations/${alert.investigation.id}`}>
            <FolderOpen /> Investigation #{alert.investigation.id}
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
