"use client";

import { useSyncExternalStore } from "react";

import { formatDateTime, formatDateTimeFull, formatRelative } from "@/lib/format";

const noop = () => () => {};

/**
 * Renders an absolute UTC time on the server and during hydration, then a relative time in the
 * browser. The full timestamp is always available in the tooltip.
 */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return (
    <time
      dateTime={iso}
      title={formatDateTimeFull(iso)}
      className={className}
      suppressHydrationWarning
    >
      {mounted ? formatRelative(iso) : formatDateTime(iso)}
    </time>
  );
}
