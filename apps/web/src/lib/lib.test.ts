import type { TechniqueCoverage } from "@cyberforge/types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiGet, apiGetOrNull, apiSend, buildQuery } from "./api";
import {
  compareSeverity,
  formatDateTime,
  formatDuration,
  formatRelative,
  titleCase,
  truncate,
} from "./format";
import { highlightSegments, patternNeedles } from "./highlight";
import {
  DOMAINS,
  contentCoverage,
  coverageSummary,
  heatBackground,
  heatLevel,
  isDomain,
  nestTechniques,
} from "./mitre";
import { hrefWith, mergeParams, positiveInt, toggleValue } from "./params";

describe("format", () => {
  it("renders timestamps in UTC so server and client agree", () => {
    // ICU spells September "Sep" or "Sept" depending on version; the UTC time is what matters.
    expect(formatDateTime("2026-09-29T14:05:00Z")).toMatch(/^29 Sep\w*, 14:05 UTC$/);
    expect(formatDateTime("2026-01-01T23:59:00Z")).toMatch(/^01 Jan, 23:59 UTC$/);
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    expect(formatRelative("2026-09-29T11:59:50Z", now)).toBe("just now");
    expect(formatRelative("2026-09-29T11:15:00Z", now)).toBe("45m ago");
    expect(formatRelative("2026-09-29T09:00:00Z", now)).toBe("3h ago");
    expect(formatRelative("2026-09-26T12:00:00Z", now)).toBe("3d ago");
    expect(formatRelative("2026-09-29T13:00:00Z", now)).toBe("1h from now");
  });

  it("formats durations, casing and truncation", () => {
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(95)).toBe("1h 35m");
    expect(titleCase("windows-sim")).toBe("Windows Sim");
    expect(titleCase("false_positive")).toBe("False Positive");
    expect(truncate("abcdefghij", 5)).toBe("abcd…");
    expect(truncate("abc", 5)).toBe("abc");
  });

  it("orders severities from most to least severe", () => {
    const sorted = (["low", "critical", "informational", "high", "medium"] as const).toSorted(
      compareSeverity,
    );
    expect(sorted).toEqual(["critical", "high", "medium", "low", "informational"]);
  });
});

describe("params (URL-driven filter state)", () => {
  it("merges updates, deletes empty values and repeats arrays", () => {
    const next = mergeParams("severity=high&q=abc", { q: "", status: ["new", "investigating"] });
    expect(next.getAll("severity")).toEqual(["high"]);
    expect(next.has("q")).toBe(false);
    expect(next.getAll("status")).toEqual(["new", "investigating"]);
  });

  it("resets pagination whenever a filter changes, but not when paging", () => {
    expect(mergeParams("page=4&q=x", { severity: "high" }).has("page")).toBe(false);
    expect(mergeParams("page=4&q=x", { page: 5 }).get("page")).toBe("5");
  });

  it("builds hrefs and toggles values", () => {
    expect(hrefWith("/soc/alerts", { severity: ["high", "low"] }, { page: 2 })).toBe(
      "/soc/alerts?severity=high&severity=low&page=2",
    );
    expect(hrefWith("/x", "a=1", { a: null })).toBe("/x");
    expect(toggleValue(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });

  it("parses page numbers defensively", () => {
    expect(positiveInt("3", 1)).toBe(3);
    expect(positiveInt("-2", 1)).toBe(1);
    expect(positiveInt("abc", 1)).toBe(1);
    expect(positiveInt("99999", 1, 100)).toBe(100);
    expect(positiveInt(undefined, 7)).toBe(7);
  });
});

describe("highlightSegments", () => {
  it("marks matched values case-insensitively", () => {
    const segments = highlightSegments("powershell.exe -ENC AAAA", ["-enc"]);
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual(["-ENC"]);
    expect(segments.map((s) => s.text).join("")).toBe("powershell.exe -ENC AAAA");
  });

  it("finds values inside JSON-escaped raw logs", () => {
    const raw = String.raw`{"Image":"C:\\Windows\\System32\\powershell.exe"}`;
    const marked = highlightSegments(raw, [String.raw`C:\Windows\System32\powershell.exe`]).filter(
      (s) => s.match,
    );
    expect(marked).toHaveLength(1);
    expect(marked[0]?.text).toBe(String.raw`C:\\Windows\\System32\\powershell.exe`);
  });

  it("merges overlapping matches and ignores tiny needles", () => {
    const segments = highlightSegments("abcdefgh", ["abcde", "cdefg", "a"]);
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual(["abcdefg"]);
  });

  it("extracts literal fragments from Sigma patterns", () => {
    expect(patternNeedles("*\\powershell.exe")).toEqual(["\\powershell.exe"]);
    expect(patternNeedles("re:^[a-z]{3}")).toEqual(["^[a-z]{3}"]);
    expect(patternNeedles("*a*")).toEqual([]);
  });
});

describe("api client", () => {
  afterEach(() => vi.restoreAllMocks());

  const respond = (status: number, body: unknown) =>
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );

  it("serialises query parameters, skipping empties", () => {
    expect(buildQuery({ a: 1, b: "", c: null, d: undefined, e: ["x", "y"], f: false })).toBe(
      "?a=1&e=x&e=y&f=false",
    );
    expect(buildQuery()).toBe("");
  });

  it("returns parsed JSON on success", async () => {
    respond(200, { ok: true });
    await expect(apiGet<{ ok: boolean }>("/labs")).resolves.toEqual({ ok: true });
  });

  it("turns FastAPI validation errors into readable messages", async () => {
    respond(422, { detail: [{ msg: "Field required" }, { msg: "Too short" }] });
    await expect(apiSend("POST", "/investigations", {})).rejects.toMatchObject({
      status: 422,
      message: "Field required; Too short",
    });
  });

  it("surfaces structured rule errors and string details", async () => {
    respond(422, { detail: { message: "Rule is not valid", errors: ["bad modifier"] } });
    await expect(apiSend("POST", "/detections", {})).rejects.toThrow(
      "Rule is not valid: bad modifier",
    );
    respond(422, { detail: "8.8.8.8 is not a private address" });
    await expect(apiSend("POST", "/lab-runs", {})).rejects.toThrow(
      "8.8.8.8 is not a private address",
    );
  });

  it("apiGetOrNull maps 404 to null but rethrows other errors", async () => {
    respond(404, { detail: "Not found" });
    await expect(apiGetOrNull("/alerts/1")).resolves.toBeNull();
    respond(500, { detail: "boom" });
    await expect(apiGetOrNull("/alerts/1")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("mitre helpers", () => {
  it("answers the four content-coverage questions", () => {
    const t = (id: string, over: Partial<TechniqueCoverage>) =>
      ({
        id,
        name: id,
        framework: "attack",
        is_subtechnique: false,
        parent_id: null,
        tactic_ids: [],
        labs: 0,
        rules: 0,
        alerts: 0,
        investigations: 0,
        stories: 0,
        tested_rules: 0,
        lacking_tests: false,
        domains: [],
        ...over,
      }) as TechniqueCoverage;
    const c = contentCoverage([
      t("T1", { labs: 1, rules: 1, tested_rules: 1, stories: 1 }),
      t("T2", { labs: 2, lacking_tests: true }),
      t("T3", { rules: 1, lacking_tests: true }),
      t("T3.001", { rules: 1, is_subtechnique: true, parent_id: "T3" }),
      t("T4", {}),
    ]);
    expect(c.total).toBe(4);
    expect(c.labs.map((x) => x.id)).toEqual(["T1", "T2"]);
    expect(c.detections.map((x) => x.id)).toEqual(["T1", "T3"]);
    expect(c.stories.map((x) => x.id)).toEqual(["T1"]);
    expect(c.lackingTests.map((x) => x.id)).toEqual(["T2", "T3"]);
  });

  it("recognises only the six platform domains", () => {
    expect(DOMAINS).toEqual(["Windows", "Linux", "Network", "Web", "Cloud", "AI Security"]);
    expect(isDomain("Web")).toBe(true);
    expect(isDomain("Mainframe")).toBe(false);
    expect(isDomain(undefined)).toBe(false);
  });

  const tech = (
    id: string,
    rules: number,
    extra: Partial<TechniqueCoverage> = {},
  ): TechniqueCoverage => ({
    id,
    name: id,
    framework: "attack",
    is_subtechnique: id.includes("."),
    parent_id: id.includes(".") ? id.split(".")[0]! : null,
    tactic_ids: [],
    labs: 0,
    rules,
    alerts: 0,
    investigations: 0,
    stories: 0,
    tested_rules: 0,
    lacking_tests: false,
    domains: [],
    ...extra,
  });

  it("buckets counts into coarse heat levels", () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(heatLevel)).toEqual([0, 1, 2, 3, 3, 4, 4]);
    expect(heatBackground(0)).toBeUndefined();
    expect(heatBackground(3)).toContain("var(--primary)");
  });

  it("nests sub-techniques under their parents", () => {
    const nested = nestTechniques([tech("T1059", 2), tech("T1059.001", 3), tech("T1110", 0)]);
    expect(nested.map((n) => [n.parent.id, n.children.map((c) => c.id)])).toEqual([
      ["T1059", ["T1059.001"]],
      ["T1110", []],
    ]);
  });

  it("summarises coverage over top-level techniques only", () => {
    const summary = coverageSummary([
      tech("T1059", 2),
      tech("T1059.001", 0),
      tech("T1110", 0),
      tech("T1190", 1),
    ]);
    expect(summary).toMatchObject({ total: 3, covered: 2, pct: 67 });
    expect(summary.gaps.map((g) => g.id)).toEqual(["T1110"]);
  });
});
