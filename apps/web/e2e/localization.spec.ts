import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext } from "@playwright/test";

import { main } from "./helpers";

const LOCALE_COOKIE = "cyberforge_locale";

async function useTurkish(context: BrowserContext, baseURL: string | undefined) {
  await context.addCookies([
    { name: LOCALE_COOKIE, value: "tr", url: baseURL ?? "http://localhost" },
  ]);
}

test.describe("language switching", () => {
  test("switches to Turkish, survives a reload and switches back", async ({ page }) => {
    await page.goto("/");
    await expect(main(page).getByRole("heading", { name: "Security dashboard" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("combobox", { name: "Language" }).first().selectOption("tr");

    await expect(
      main(page).getByRole("heading", { name: "Güvenlik gösterge paneli" }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");

    await page.reload();
    await expect(
      main(page).getByRole("heading", { name: "Güvenlik gösterge paneli" }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "tr");

    await page.getByRole("combobox", { name: "Dil" }).first().selectOption("en");
    await expect(main(page).getByRole("heading", { name: "Security dashboard" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});

test.describe("Turkish interface", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await useTurkish(context, baseURL);
  });

  const pages = [
    { path: "/", heading: "Güvenlik gösterge paneli" },
    { path: "/labs", heading: "Siber tatbikat alanı" },
    { path: "/detections", heading: "Tespit çalışma alanı" },
    { path: "/detections/playground", heading: "Tespit deneme alanı" },
    { path: "/mitre", heading: "MITRE ATT&CK gezgini" },
    { path: "/settings", heading: "Ayarlar" },
  ];

  for (const { path, heading } of pages) {
    test(`${path} is translated`, async ({ page }) => {
      await page.goto(path);
      await expect(main(page).getByRole("heading", { name: heading, level: 1 })).toBeVisible();
    });
  }

  test("authored lab content comes from the reviewed catalogue", async ({ page }) => {
    await page.goto("/labs/broken-authentication");
    await expect(main(page).getByRole("heading", { name: "Bozuk Kimlik Doğrulama" })).toBeVisible();
    await expect(main(page)).toContainText("betikli parola tahmini");
  });

  test("lifecycle stage summaries are localized", async ({ page }) => {
    await page.goto("/lifecycle");
    const tabs = page.getByRole("tab");
    await expect(tabs.first()).toBeVisible();
    await expect(page.getByTestId("lifecycle")).not.toContainText(/\d+ events?\b/);
  });

  for (const path of ["/", "/mitre", "/stories"]) {
    test(`${path} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await page.addStyleTag({
        content: "*,*::before,*::after{animation:none!important;transition:none!important}",
      });
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .exclude("nextjs-portal")
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      expect(
        blocking.map((v) => `${v.id}: ${v.help}`),
        "axe violations in Turkish",
      ).toEqual([]);
    });
  }
});

test.describe("project information", () => {
  for (const [language, title, label] of [
    ["en", "About CyberForge", "Author"],
    ["tr", "CyberForge hakkında", "Yazar"],
  ] as const) {
    test(`Settings credits the author and how to reach them (${language})`, async ({
      page,
      context,
      baseURL,
    }) => {
      await context.addCookies([
        { name: LOCALE_COOKIE, value: language, url: baseURL ?? "http://localhost" },
      ]);
      await page.goto("/settings");
      const about = page.getByTestId("about-card");
      await expect(about.getByText(title)).toBeVisible();
      await expect(about.getByText(label, { exact: true })).toBeVisible();
      await expect(about.getByText("Abdurrahman Kutlu")).toBeVisible();
      await expect(
        about.getByRole("link", { name: "rahmankutlu.com", exact: true }),
      ).toHaveAttribute("href", "https://rahmankutlu.com");
      await expect(
        about.getByRole("link", { name: "info@rahmankutlu.com", exact: true }),
      ).toHaveAttribute("href", "mailto:info@rahmankutlu.com");
    });
  }
});

test.describe("bundle size", () => {
  // The catalogue holds hundreds of KB of authored text. Server Components translate content and pass
  // it down, so none of it may reach the browser; a client import of lib/i18n/content brings it back.
  const routes = ["/", "/demo", "/stories", "/soc/alerts", "/lifecycle", "/settings"];

  test("does not ship the Turkish content catalogue to the browser", async ({ page }) => {
    const scripts: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("/_next/static/") && response.url().endsWith(".js")) {
        scripts.push(await response.text());
      }
    });
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
    }
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts.filter((code) => code.includes("Bozuk Kimlik Doğrulama"))).toHaveLength(0);
  });
});
