import type {
  PlaygroundExplain,
  SigmaExplanation,
  SuricataExplanation,
  Verdict,
  YaraExplanation,
} from "@cyberforge/types";

import { matchedRows } from "@/lib/trace";

export type Filter = "all" | "matched" | "unmatched";

export function verdictLabel(verdict: Verdict): string {
  if (verdict === "matched") return "Matched";
  if (verdict === "no_match") return "No match";
  return "Not applicable";
}

/** Seconds from the start of a dataset as `MM:SS` (or `H:MM:SS` past an hour). */
export function formatOffset(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Literal fragments of the raw event that the rule matched on, for highlighting. */
export function matchNeedles(data: PlaygroundExplain | undefined): string[] {
  if (!data || !data.explanation) return [];
  if (data.format === "sigma") {
    return matchedRows((data.explanation as SigmaExplanation).selections)
      .map((r) => r.pattern)
      .filter((p) => p.length >= 3);
  }
  if (data.format === "yara") {
    return (data.explanation as YaraExplanation).strings
      .filter((s) => s.matched && s.kind === "text")
      .map((s) => s.pattern);
  }
  return (data.explanation as SuricataExplanation).checks
    .filter((c) => c.matched && c.kind === "content")
    .map((c) => c.pattern);
}
