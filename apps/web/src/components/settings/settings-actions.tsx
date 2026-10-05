"use client";

import { Button } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { CloudUpload, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { apiGet, apiSend } from "@/lib/api";
import { getProfileId, useLearningProgress } from "@/lib/learning-progress";
import { useLocale } from "@/components/i18n/locale-provider";

export function LearningProgressActions() {
  const { t } = useLocale();
  const { completed, reset } = useLearningProgress();
  const backup = useMutation({
    mutationFn: () => apiSend("PUT", `/learning/progress/${getProfileId()}`, { completed }),
    onSuccess: () => toast.success(t("settings.progressBackedUp")),
    onError: (e: Error) => toast.error(t("settings.backupFailed"), { description: e.message }),
  });
  const restore = useMutation({
    mutationFn: () => apiGet<{ completed: string[] }>(`/learning/progress/${getProfileId()}`),
    onSuccess: (data) => {
      window.localStorage.setItem("cyberforge:learning:completed", JSON.stringify(data.completed));
      window.dispatchEvent(new StorageEvent("storage", { key: "cyberforge:learning:completed" }));
      toast.success(t("settings.restored", { count: data.completed.length }));
      window.location.reload();
    },
    onError: (e: Error) => toast.error(t("settings.restoreFailed"), { description: e.message }),
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => backup.mutate()}
        disabled={backup.isPending}
      >
        <CloudUpload /> {t("settings.backup", { count: completed.length })}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => restore.mutate()}
        disabled={restore.isPending}
      >
        <RotateCcw /> {t("settings.restore")}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          reset();
          toast.success(t("settings.progressCleared"));
        }}
      >
        <Trash2 /> {t("settings.clearProgress")}
      </Button>
    </div>
  );
}

export function DemoResetButton() {
  const router = useRouter();
  const { t } = useLocale();
  const reset = useMutation({
    mutationFn: () => apiSend<{ detail: string }>("POST", "/demo/reset"),
    onSuccess: (d) => {
      toast.success(t("settings.demoReset"), { description: d.detail });
      router.refresh();
    },
    onError: (e: Error) => toast.error(t("settings.resetFailed"), { description: e.message }),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={reset.isPending}
      onClick={() => {
        if (window.confirm(t("settings.resetConfirm"))) reset.mutate();
      }}
    >
      <RotateCcw /> {reset.isPending ? t("settings.resetting") : t("settings.resetDemo")}
    </Button>
  );
}
