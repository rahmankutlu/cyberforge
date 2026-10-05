import { Skeleton } from "@cyberforge/ui";
import { createCopyTranslator } from "@/lib/i18n/copy";
import { getLocale } from "@/lib/i18n/server";

export default async function Loading() {
  const c = createCopyTranslator(await getLocale());
  return (
    <div role="status" aria-live="polite" aria-label={c("Loading")}>
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="h-6 w-64" />
      <Skeleton className="mb-6 mt-2 h-4 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="mt-4 h-72 w-full" />
      <span className="sr-only">{c("Loading…")}</span>
    </div>
  );
}
