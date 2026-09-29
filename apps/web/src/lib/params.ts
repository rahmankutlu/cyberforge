/** Helpers for URL-driven state: filters, sorting and pagination live in the query string. */

export type SearchParams = Record<string, string | string[] | undefined>;

export const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export const all = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

export function positiveInt(
  value: string | string[] | undefined,
  fallback: number,
  max = 10_000,
): number {
  const parsed = Number.parseInt(first(value) ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, max) : fallback;
}

/**
 * Merge `updates` into the current query string. Empty/undefined values delete the key; arrays are
 * written as repeated keys. Any change other than `page` itself resets `page` to 1.
 */
export function mergeParams(
  current: string | URLSearchParams | SearchParams,
  updates: Record<string, string | number | readonly string[] | null | undefined>,
): URLSearchParams {
  const next = new URLSearchParams();
  if (typeof current === "string" || current instanceof URLSearchParams) {
    new URLSearchParams(current).forEach((v, k) => next.append(k, v));
  } else {
    for (const [k, v] of Object.entries(current)) {
      for (const item of all(v)) next.append(k, item);
    }
  }
  let changedNonPage = false;
  for (const [key, value] of Object.entries(updates)) {
    next.delete(key);
    if (key !== "page") changedNonPage = true;
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) next.append(key, item);
    } else {
      next.set(key, String(value));
    }
  }
  if (changedNonPage && !("page" in updates)) next.delete("page");
  return next;
}

export function hrefWith(
  pathname: string,
  current: string | URLSearchParams | SearchParams,
  updates: Record<string, string | number | readonly string[] | null | undefined>,
): string {
  const query = mergeParams(current, updates).toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function toggleValue(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}
