import { describe, expect, it } from "vitest";

import glossary from "./glossary.tr.json";
import { trCopy } from "./copy";
import { enMessages, trMessages } from "./messages";
import trContent from "./tr-content.json";

type Entry = readonly [source: string, translation: string];

const layers: Record<string, readonly Entry[]> = {
  messages: Object.entries(trMessages),
  copy: Object.entries(trCopy),
  content: Object.entries(trContent),
};

const placeholders = (text: string) => [...text.matchAll(/\{\{\w+\}\}/g)].map((m) => m[0]).sort();
const tags = (text: string) => [...text.matchAll(/<\/?\w+>/g)].map((m) => m[0]).sort();
const codeSpans = (text: string) => [...text.matchAll(/`[^`\n]+`/g)].map((m) => m[0]).sort();

describe("Turkish message catalogues", () => {
  it("covers exactly the English message keys", () => {
    expect(Object.keys(trMessages).sort()).toEqual(Object.keys(enMessages).sort());
  });

  it("keeps placeholders identical to the English source in interface messages", () => {
    for (const [key, english] of Object.entries(enMessages)) {
      expect(placeholders(trMessages[key as keyof typeof trMessages]), key).toEqual(
        placeholders(english),
      );
    }
  });

  it("keeps placeholders and inline tags identical in feature copy", () => {
    for (const [source, translation] of layers.copy) {
      expect(placeholders(translation), source).toEqual(placeholders(source));
      expect(tags(translation), source).toEqual(tags(source));
    }
  });

  it("keeps code spans identical in authored content and leaves no entry empty", () => {
    for (const [source, translation] of layers.content) {
      expect(translation.trim(), source).not.toBe("");
      expect(codeSpans(translation), source).toEqual(codeSpans(source));
    }
  });
});

describe("Turkish terminology", () => {
  const rules = glossary.avoid.map((rule) => ({
    ...rule,
    regex: new RegExp(rule.pattern, "iu"),
    allow: rule.allow ?? [],
  }));

  for (const [layer, entries] of Object.entries(layers)) {
    it(`uses the preferred terms in ${layer}`, () => {
      const violations: string[] = [];
      for (const [source, translation] of entries) {
        for (const rule of rules) {
          if (!rule.regex.test(translation)) continue;
          if (rule.allow.some((phrase) => translation.includes(phrase))) continue;
          violations.push(
            `/${rule.pattern}/ → "${rule.use}": ${translation.slice(0, 80)} (${source.slice(0, 40)})`,
          );
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
