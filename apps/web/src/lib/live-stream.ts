import type { StreamEvent } from "@cyberforge/types";

/** How many events the live panel keeps on screen. */
export const STREAM_WINDOW = 12;

/** Newest first, capped: the stream never grows the page or the heap. */
export function pushEvent(
  current: readonly StreamEvent[],
  next: StreamEvent,
  limit = STREAM_WINDOW,
): StreamEvent[] {
  return [next, ...current].slice(0, limit);
}

/** Parse one SSE data payload; a malformed message is dropped instead of breaking the panel. */
export function parseStreamEvent(data: string): StreamEvent | null {
  try {
    const value = JSON.parse(data) as Partial<StreamEvent>;
    if (typeof value.seq !== "number" || typeof value.timestamp !== "string") return null;
    if (typeof value.host !== "string" || typeof value.event_type !== "string") return null;
    return {
      seq: value.seq,
      timestamp: value.timestamp,
      source: value.source ?? null,
      host: value.host,
      event_type: value.event_type,
      message: typeof value.message === "string" ? value.message : "",
      rule: value.rule ?? null,
      rule_slug: value.rule_slug ?? null,
      severity: typeof value.severity === "string" ? value.severity : "informational",
      dataset: typeof value.dataset === "string" ? value.dataset : "",
    };
  } catch {
    return null;
  }
}

/** HH:MM:SS in UTC from an ISO timestamp. */
export const clock = (iso: string): string => iso.slice(11, 19);
