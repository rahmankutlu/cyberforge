"use client";

import { Button } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { apiSend } from "@/lib/api";

/** Generates fresh synthetic telemetry by replaying a couple of labs (demo mode only). */
export function GenerateTelemetryButton() {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: () =>
      apiSend<{ detail: string }>("POST", "/demo/generate", undefined, { count: 2 }),
    onSuccess: (data) => {
      toast.success("Telemetry generated", { description: data.detail });
      router.refresh();
    },
    onError: (error: Error) =>
      toast.error("Could not generate telemetry", { description: error.message }),
  });

  return (
    <Button variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
      <Sparkles />
      {mutation.isPending ? "Generating…" : "Generate demo telemetry"}
    </Button>
  );
}
