import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Automated accessibility checks on the v0.2 pages, in both themes. axe finds the machine-detectable
 * problems (contrast, names, roles, table structure, focus); keyboard flows are covered by the
 * individual specs. Only serious and critical findings fail the build, and each failure lists the
 * rule and the offending elements so it can be fixed rather than suppressed.
 */
const pages: {
  name: string;
  path: string;
  ready: string;
  prepare?: (page: Page) => Promise<void>;
}[] = [
  { name: "dashboard", path: "/", ready: "[data-testid=live-stream] [data-testid=stream-row]" },
  {
    name: "detection playground",
    path: "/detections/playground",
    ready: "[data-testid=match-outcome]",
  },
  { name: "stories index", path: "/stories", ready: "[data-testid=story-grid]" },
  {
    name: "story",
    path: "/stories/compromised-developer-workstation",
    ready: "[data-testid=story-player]",
    prepare: async (page) => {
      await page.getByTestId("reveal-next").click();
      await page.getByTestId("story-step").nth(1).waitFor();
      await page.locator("[data-evidence=hr-roster]").getByTestId("mark-finding").click();
    },
  },
  { name: "demo", path: "/demo?t=52", ready: "[data-testid=demo-alerts]" },
  { name: "MITRE explorer", path: "/mitre", ready: "[data-testid=matrix]" },
  {
    name: "MITRE content coverage",
    path: "/mitre?view=content",
    ready: "[data-testid=content-coverage]",
  },
  {
    name: "rule page",
    path: "/detections/win-encoded-powershell-command",
    ready: "[data-testid=quality-card]",
  },
  { name: "detections list", path: "/detections", ready: "[data-testid=coverage-summary]" },
];

for (const theme of ["dark", "light"] as const) {
  test.describe(`accessibility (${theme})`, () => {
    test.use({ colorScheme: theme });

    for (const target of pages) {
      test(`${target.name} has no serious or critical axe violations`, async ({ page }) => {
        await page.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
        await page.goto(target.path);
        await page.waitForSelector(target.ready, { timeout: 30_000 });
        if (target.prepare) await target.prepare(page);
        // Let entrance animations finish so contrast is measured on the settled colours.
        await page.addStyleTag({
          content: "*,*::before,*::after{animation:none!important;transition:none!important}",
        });
        await page.waitForTimeout(300);

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .exclude("nextjs-portal")
          .analyze();
        const blocking = results.violations.filter(
          (v) => v.impact === "serious" || v.impact === "critical",
        );
        const report = blocking.map(
          (v) =>
            `${v.id} (${v.impact}): ${v.help}\n` +
            v.nodes
              .slice(0, 4)
              .map(
                (n) =>
                  `  - ${n.target.join(" ")}\n    ${n.failureSummary?.split("\n").slice(1, 3).join(" ")}`,
              )
              .join("\n"),
        );
        expect(report, report.join("\n\n")).toEqual([]);
      });
    }
  });
}
