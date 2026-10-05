"use client";

import { useSyncExternalStore } from "react";

import { formatDateTime, formatDateTimeFull, formatRelative } from "@/lib/format";
import { useLocale } from "@/components/i18n/locale-provider";

const noop = () => () => {};

/**
 * Renders an absolute UTC time on the server and during hydration, then a relative time in the
 * browser. The full timestamp is always available in the tooltip.
 */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const { locale } = useLocale();
  const mounted = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return (
    <time
      dateTime={iso}
      title={formatDateTimeFull(iso, locale)}
      className={className}
      suppressHydrationWarning
    >
      {mounted ? formatRelative(iso, undefined, locale) : formatDateTime(iso, locale)}
    </time>
  );
}
