"use client";

import { Button, EmptyState } from "@cyberforge/ui";
import { PlugZap, RotateCw } from "lucide-react";
import { useEffect } from "react";
import { useLocale } from "@/components/i18n/locale-provider";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { c } = useLocale();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      className="mt-10"
      icon={<PlugZap />}
      title={c("This page could not be loaded")}
      description={
        c(
          "The CyberForge API may still be starting or is unreachable. Check that it is running (docker compose up, or `pnpm dev:api`) and try again.",
        ) + (error.digest ? ` (ref ${error.digest})` : "")
      }
      action={
        <Button onClick={reset}>
          <RotateCw /> {c("Try again")}
        </Button>
      }
    />
  );
}
