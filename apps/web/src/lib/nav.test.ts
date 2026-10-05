import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "@/lib/i18n";
import { getAllNavigation, getNavigation, isActive, NAV } from "@/lib/nav";

describe("navigation", () => {
  const all = getAllNavigation("en");

  it("links every page once and gives every shortcut to one page", () => {
    const hrefs = all.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);

    const shortcuts = all.flatMap((item) => (item.shortcut ? [item.shortcut] : []));
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
  });

  it("translates every group and item in every supported language", () => {
    for (const locale of SUPPORTED_LOCALES) {
      const groups = getNavigation(locale);
      expect(groups).toHaveLength(NAV.length);
      for (const label of [
        ...groups.map((g) => g.label),
        ...getAllNavigation(locale).map((i) => i.label),
      ]) {
        expect(label.trim(), `${locale} label`).not.toBe("");
        expect(label, `${locale} label has no message`).not.toMatch(/^[a-z]+\.[A-Za-z.]+$/);
      }
    }
  });

  it("shows Turkish labels without touching the English source", () => {
    const tr = getAllNavigation("tr");
    expect(tr.find((item) => item.href === "/")?.label).toBe("Gösterge Paneli");
    expect(all.find((item) => item.href === "/")?.label).toBe("Dashboard");
    expect(tr.map((i) => i.href)).toEqual(all.map((i) => i.href));
  });
});

describe("isActive", () => {
  it("matches the dashboard only on the exact path", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/labs", "/")).toBe(false);
  });

  it("matches a section and its children but not a sibling prefix", () => {
    expect(isActive("/labs", "/labs")).toBe(true);
    expect(isActive("/labs/broken-authentication", "/labs")).toBe(true);
    expect(isActive("/labsx", "/labs")).toBe(false);
  });

  it("keeps the playground and the 30-day plan out of their parent sections", () => {
    expect(isActive("/detections/playground", "/detections")).toBe(false);
    expect(isActive("/detections/win-encoded-powershell-command", "/detections")).toBe(true);
    expect(isActive("/learn/30-days", "/learn")).toBe(false);
    expect(isActive("/learn/web-security", "/learn")).toBe(true);
  });
});
