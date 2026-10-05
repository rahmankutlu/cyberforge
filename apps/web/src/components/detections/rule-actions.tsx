"use client";

import type { RuleDetail } from "@cyberforge/types";
import { Button } from "@cyberforge/ui";
import { useMutation } from "@tanstack/react-query";
import { FlaskConical, Power, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { apiSend } from "@/lib/api";
import { useLocale } from "@/components/i18n/locale-provider";

export function RuleActions({ rule }: { rule: RuleDetail }) {
  const { c } = useLocale();
  const router = useRouter();
  const toggle = useMutation({
    mutationFn: () =>
      apiSend<RuleDetail>("PATCH", `/detections/${rule.slug}`, { enabled: !rule.enabled }),
    onSuccess: (updated) => {
      toast.success(updated.enabled ? c("Rule enabled") : c("Rule disabled"), {
        description: updated.enabled
          ? c("It will run against new events.")
          : c("It will be skipped for new events."),
      });
      router.refresh();
    },
    onError: (e: Error) => toast.error(c("Update failed"), { description: e.message }),
  });
  const remove = useMutation({
    mutationFn: () => apiSend<void>("DELETE", `/detections/${rule.slug}`),
    onSuccess: () => {
      toast.success(c("Rule deleted"));
      router.push("/detections");
    },
    onError: (e: Error) => toast.error(c("Delete failed"), { description: e.message }),
  });

  return (
    <>
      <Button asChild variant="outline">
        <Link href={`/detections/playground?rule=${rule.slug}`}>
          <FlaskConical /> {c("Open in playground")}
        </Link>
      </Button>
      {rule.format === "sigma" ? (
        <Button
          variant="outline"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          data-testid="toggle-rule"
        >
          <Power /> {rule.enabled ? c("Disable") : c("Enable")}
        </Button>
      ) : null}
      {rule.origin === "user" ? (
        <Button
          variant="ghost"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          aria-label={c("Delete rule")}
        >
          <Trash2 /> {c("Delete")}
        </Button>
      ) : null}
    </>
  );
}
