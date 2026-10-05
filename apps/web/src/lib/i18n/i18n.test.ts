import { describe, expect, it } from "vitest";

import { createTranslator, isLocale, negotiateLocale, translate } from "./index";
import { createCopyTranslator, localizeKnownCopy } from "./copy";
import { localizeContent, localizeContentTree } from "./content";

describe("i18n", () => {
  it("translates a key into Turkish", () => {
    expect(translate("tr", "nav.dashboard")).toBe("Gösterge Paneli");
  });

  it("interpolates named values without changing missing placeholders", () => {
    const t = createTranslator("tr");
    expect(t("dashboard.qualityChecks", { passed: 8, total: 10 })).toBe(
      "10 kalite denetiminin 8 tanesi başarılı.",
    );
    expect(t("dashboard.qualityChecks", { passed: 8 })).toContain("{{total}}");
  });

  it("only accepts supported locales", () => {
    expect(isLocale("tr")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("localizes interface copy while preserving English mode", () => {
    expect(createCopyTranslator("tr")("Open the alert queue")).toBe("Uyarı kuyruğunu aç");
    expect(createCopyTranslator("en")("Open the alert queue")).toBe("Open the alert queue");
    expect(localizeKnownCopy("tr", "Coverage map")).toBe("Kapsam haritası");
  });

  it("localizes curated catalogue content and preserves unknown user content", () => {
    expect(localizeContent("tr", "Broken Authentication")).toBe("Bozuk Kimlik Doğrulama");
    expect(localizeContent("en", "Broken Authentication")).toBe("Broken Authentication");
    expect(localizeContent("tr", "User-authored case title")).toBe("User-authored case title");
  });

  it("localizes deep authored content without changing identifiers or mutating the source", () => {
    const source = {
      slug: "sql-injection-fundamentals",
      objectives: [
        "Explain how concatenating user input into SQL changes the meaning of the query.",
      ],
      note: "User-authored case title",
    };

    const localized = localizeContentTree("tr", source);

    expect(localized).not.toBe(source);
    expect(localized.slug).toBe(source.slug);
    expect(localized.objectives[0]).toBe(
      "Kullanıcı girişini SQL'de birleştirmenin sorgunun anlamını nasıl değiştirdiğini açıklayın.",
    );
    expect(localized.note).toBe(source.note);
    expect(source.objectives[0]).toMatch(/^Explain/);
    expect(localizeContentTree("en", source)).toBe(source);
  });

  it("negotiates the locale from Accept-Language", () => {
    expect(negotiateLocale("tr-TR,tr;q=0.9,en;q=0.8")).toBe("tr");
    expect(negotiateLocale("en-GB,en;q=0.9,tr;q=0.8")).toBe("en");
    expect(negotiateLocale("de-DE,de;q=0.9,tr;q=0.5")).toBe("tr");
    expect(negotiateLocale("tr;q=0, en")).toBe("en");
    expect(negotiateLocale("fr, de;q=0.7")).toBe("en");
    expect(negotiateLocale("*")).toBe("en");
    expect(negotiateLocale("")).toBe("en");
    expect(negotiateLocale(null)).toBe("en");
  });

  it("never resolves API text through object prototypes", () => {
    for (const value of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      expect(localizeContent("tr", value)).toBe(value);
    }
  });

  it("translates a story title and trims trailing whitespace from YAML block scalars", () => {
    expect(localizeContent("tr", "Compromised Developer Workstation")).toBe(
      "Ele Geçirilmiş Geliştirici İş İstasyonu",
    );
    expect(localizeContent("tr", "30 Days of CyberForge\n")).toBe("30 Günde CyberForge");
  });
});
