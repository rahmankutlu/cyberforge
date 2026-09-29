"use client";

import type { RuleDetail } from "@cyberforge/types";
import { Button } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { FlaskConical, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { apiSend } from "@/lib/api";

export function RuleActions({ rule }: { rule: RuleDetail }) {
  const router = useRouter();
  const toggle = useMutation({
    mutationFn: () => apiSend<RuleDetail>("PATCH", `/detections/${rule.slug}`, { enabled: !rule.enabled }),
    onSuccess: (updated) => {
      toast.success(updated.enabled ? "Rule enabled" : "Rule disabled", {
        description: updated.enabled ? "It will run against new events." : "It will be skipped for new events.",
      });
      router.refresh();
    },
    onError: (e: Error) => toast.error("Update failed", { description: e.message }),
  });
  const remove = useMutation({
    mutationFn: () => apiSend<void>("DELETE", `/detections/${rule.slug}`),
    onSuccess: () => {
      toast.success("Rule deleted");
      router.push("/detections");
    },
    onError: (e: Error) => toast.error("Delete failed", { description: e.message }),
  });

  return (
    <>
      {rule.format === "sigma" ? (
        <Button asChild variant="outline">
          <Link href={`/detections/playground?rule=${rule.slug}`}><FlaskConical /> Open in playground</Link>
        </Button>
      ) : null}
      {rule.format === "sigma" ? (
        <Button variant="outline" onClick={() => toggle.mutate()} disabled={toggle.isPending} data-testid="toggle-rule">
          <Power /> {rule.enabled ? "Disable" : "Enable"}
        </Button>
      ) : null}
      {rule.origin === "user" ? (
        <Button variant="ghost" onClick={() => remove.mutate()} disabled={remove.isPending} aria-label="Delete rule">
          <Trash2 /> Delete
        </Button>
      ) : null}
    </>
  );
}
