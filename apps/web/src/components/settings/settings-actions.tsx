"use client";

import { Button } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { CloudUpload, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { apiGet, apiSend } from "@/lib/api";
import { getProfileId, useLearningProgress } from "@/lib/learning-progress";

export function LearningProgressActions() {
  const { completed, reset } = useLearningProgress();
  const backup = useMutation({
    mutationFn: () => apiSend("PUT", `/learning/progress/${getProfileId()}`, { completed }),
    onSuccess: () => toast.success("Progress backed up to this CyberForge instance"),
    onError: (e: Error) => toast.error("Backup failed", { description: e.message }),
  });
  const restore = useMutation({
    mutationFn: () => apiGet<{ completed: string[] }>(`/learning/progress/${getProfileId()}`),
    onSuccess: (data) => {
      window.localStorage.setItem("cyberforge:learning:completed", JSON.stringify(data.completed));
      window.dispatchEvent(new StorageEvent("storage", { key: "cyberforge:learning:completed" }));
      toast.success(`Restored ${data.completed.length} completed modules`);
      window.location.reload();
    },
    onError: (e: Error) => toast.error("Restore failed", { description: e.message }),
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => backup.mutate()}
        disabled={backup.isPending}
      >
        <CloudUpload /> Back up ({completed.length})
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => restore.mutate()}
        disabled={restore.isPending}
      >
        <RotateCcw /> Restore
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          reset();
          toast.success("Local progress cleared");
        }}
      >
        <Trash2 /> Clear local progress
      </Button>
    </div>
  );
}

export function DemoResetButton() {
  const router = useRouter();
  const reset = useMutation({
    mutationFn: () => apiSend<{ detail: string }>("POST", "/demo/reset"),
    onSuccess: (d) => {
      toast.success("Demo data reset", { description: d.detail });
      router.refresh();
    },
    onError: (e: Error) => toast.error("Reset failed", { description: e.message }),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={reset.isPending}
      onClick={() => {
        if (
          window.confirm(
            "Reset all synthetic alerts, events and investigations and reseed the demo data? Rules and notes you created are removed with them.",
          )
        )
          reset.mutate();
      }}
    >
      <RotateCcw /> {reset.isPending ? "Resetting…" : "Reset demo data"}
    </Button>
  );
}
