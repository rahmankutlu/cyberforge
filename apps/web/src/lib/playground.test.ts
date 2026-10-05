import { describe, expect, it } from "vitest";

import { formatOffset, matchNeedles, verdictLabel } from "./playground";

describe("formatOffset", () => {
  it("formats minutes and seconds, adding hours only when needed", () => {
    expect(formatOffset(0)).toBe("00:00");
    expect(formatOffset(75.4)).toBe("01:15");
    expect(formatOffset(3600)).toBe("1:00:00");
    expect(formatOffset(3725)).toBe("1:02:05");
  });

  it("never goes negative", () => {
    expect(formatOffset(-5)).toBe("00:00");
  });
});

describe("verdictLabel", () => {
  it("names each verdict in words", () => {
    expect(verdictLabel("matched")).toBe("Matched");
    expect(verdictLabel("no_match")).toBe("No match");
    expect(verdictLabel("not_applicable")).toBe("Not applicable");
  });
});

describe("matchNeedles", () => {
  it("returns nothing without an explanation", () => {
    expect(matchNeedles(undefined)).toEqual([]);
  });

  it("collects matched YARA text strings only", () => {
    const needles = matchNeedles({
      format: "yara",
      kind: "file",
      matched: true,
      item: {} as never,
      explanation: {
        rule: "R",
        matched: true,
        condition_text: "$a",
        filesize: 3,
        unsupported: null,
        terms: [],
        strings: [
          {
            name: "$a",
            kind: "text",
            pattern: "hello",
            modifiers: [],
            count: 1,
            offsets: [0],
            excerpt: null,
            matched: true,
          },
          {
            name: "$b",
            kind: "text",
            pattern: "nope",
            modifiers: [],
            count: 0,
            offsets: [],
            excerpt: null,
            matched: false,
          },
          {
            name: "$c",
            kind: "regex",
            pattern: "a+",
            modifiers: [],
            count: 1,
            offsets: [0],
            excerpt: null,
            matched: true,
          },
        ],
      },
    });
    expect(needles).toEqual(["hello"]);
  });
});
