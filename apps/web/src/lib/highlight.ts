export interface Segment {
  text: string;
  match: boolean;
}

/** Ways a value may appear inside a raw log line (plain, or JSON-escaped for JSON logs). */
function variants(value: string): string[] {
  const escaped = JSON.stringify(value).slice(1, -1);
  return escaped === value ? [value] : [value, escaped];
}

/**
 * Split `text` into segments, marking the parts that equal any of `needles`. Overlapping matches
 * are merged and longer needles win. Used to show which log values a Sigma rule matched on.
 */
export function highlightSegments(text: string, needles: readonly string[]): Segment[] {
  const candidates = [...new Set(needles.flatMap((n) => (n.trim().length >= 3 ? variants(n) : [])))]
    .filter((n) => n.length > 0)
    .sort((a, b) => b.length - a.length);

  const ranges: [number, number][] = [];
  const lower = text.toLowerCase();
  for (const needle of candidates) {
    const target = needle.toLowerCase();
    let from = 0;
    while (from <= lower.length - target.length) {
      const at = lower.indexOf(target, from);
      if (at === -1) break;
      ranges.push([at, at + target.length]);
      from = at + target.length;
    }
  }
  if (ranges.length === 0) return [{ text, match: false }];

  ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }

  const segments: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of merged) {
    if (start > cursor) segments.push({ text: text.slice(cursor, start), match: false });
    segments.push({ text: text.slice(start, end), match: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), match: false });
  return segments;
}

/** Longest literal fragments of a Sigma pattern (wildcards removed), for highlighting the raw log. */
export function patternNeedles(pattern: string): string[] {
  return pattern
    .replace(/^keyword /, "")
    .replace(/^re:/, "")
    .split(/[*?]/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);
}
