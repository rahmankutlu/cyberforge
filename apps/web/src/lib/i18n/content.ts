import type { Locale } from "@/lib/i18n";
import trContent from "@/lib/i18n/tr-content.json";

/** Maps are used instead of plain objects so API text such as "constructor" can never hit a prototype. */
const catalogue: ReadonlyMap<string, string> = new Map(Object.entries(trContent));

/** Fallback lookup by trimmed text: YAML block scalars carry a trailing newline the UI may drop. */
const catalogueByTrimmed: ReadonlyMap<string, string> = new Map(
  [...catalogue].map(([source, translation]) => [source.trim(), translation]),
);

export function localizeContent(locale: Locale, value: string): string {
  if (locale !== "tr") return value;
  return catalogue.get(value) ?? catalogueByTrimmed.get(value.trim()) ?? value;
}

/**
 * Localise authored API content without touching identifiers, telemetry, code or raw evidence.
 * Only exact strings present in the reviewed catalogue are replaced, so walking a complete API
 * object is safe and keeps new schema fields opt-in until the catalogue tooling extracts them.
 */
export function localizeContentTree<T>(locale: Locale, value: T): T {
  if (locale !== "tr" || value === null || value === undefined) return value;
  if (typeof value === "string") return localizeContent(locale, value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => localizeContentTree(locale, item)) as T;
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, localizeContentTree(locale, item)]),
    ) as T;
  }
  return value;
}
