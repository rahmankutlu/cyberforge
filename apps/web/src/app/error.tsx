"use client";

import { Button, EmptyState } from "@cyberforge/ui";
import { PlugZap, RotateCw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      className="mt-10"
      icon={<PlugZap />}
      title="This page could not be loaded"
      description={
        "The CyberForge API may still be starting or is unreachable. Check that it is running (docker compose up, or `pnpm dev:api`) and try again." +
        (error.digest ? ` (ref ${error.digest})` : "")
      }
      action={
        <Button onClick={reset}>
          <RotateCw /> Try again
        </Button>
      }
    />
  );
}
