import { expect, test } from "@playwright/test";

import { main } from "./helpers";

const VALID_RULE = `title: E2E Test Rule For Certutil Downloads
id: 0f8a5b1c-9d3e-4b7a-8c21-5a6b7c8d9e0f
status: experimental
description: Detects certutil used with url cache options (E2E).
author: E2E
date: 2026-09-01
tags:
  - attack.t1105
logsource:
  category: process_creation
  product: windows
detection:
  selection:
    Image|endswith: '\\certutil.exe'
    CommandLine|contains: 'urlcache'
  condition: selection
falsepositives:
  - Administrators
level: medium
`;

test.describe("detection engineering", () => {
  test("creates, lists and deletes a user rule", async ({ page }) => {
    await page.goto("/detections/new");
    await main(page).getByTestId("rule-editor").fill(VALID_RULE);
    await main(page).getByTestId("save-rule").click();
    await expect(page).toHaveURL(/\/detections\/user-e2e-test-rule-for-certutil-downloads$/);
    await expect(
      main(page).getByRole("heading", { name: "E2E Test Rule For Certutil Downloads" }),
    ).toBeVisible();

    await page.goto("/detections?origin=user");
    await expect(main(page).getByTestId("rule-row")).toContainText(
      "E2E Test Rule For Certutil Downloads",
    );

    await page.goto("/detections/user-e2e-test-rule-for-certutil-downloads");
    await main(page).getByRole("button", { name: "Delete rule" }).click();
    // The saved "origin=user" filter from the visit above may be restored onto the list URL.
    await expect(page).toHaveURL(/\/detections(\?origin=user)?$/);
    await expect(main(page).getByText("E2E Test Rule For Certutil Downloads")).toHaveCount(0);
  });

  test("shows detection test coverage and per-rule quality checks", async ({ page }) => {
    await page.goto("/detections");
    await expect(main(page).getByTestId("coverage-summary")).toContainText(
      /of \d+ Sigma rules tested \(100%\)/,
    );
    await page.goto("/detections/win-encoded-powershell-command");
    await expect(main(page).getByTestId("quality-score")).toHaveText("7 / 7 checks passed");
    await expect(main(page).locator("[data-check=has_negative_tests]").first()).toHaveAttribute(
      "data-passed",
      "true",
    );
    const tests = main(page).getByTestId("rule-tests");
    await expect(tests).toContainText("detects encoded PowerShell");
    await expect(tests).toContainText("must not match");
    await tests.getByText(/Show win-encoded-powershell-command.tests.yml/).click();
    await expect(tests).toContainText("expected: false");
  });

  test("lists the Sigma, YARA and Suricata rules", async ({ page }) => {
    await page.goto("/detections");
    await expect(main(page).getByText(/of \d+ rules/)).toBeVisible();
    await main(page).getByLabel("Format").selectOption("yara");
    await expect(main(page).getByTestId("rule-row")).toHaveCount(5);
  });
});

test.describe("MITRE explorer", () => {
  test("shows the coverage heatmap, gaps and technique table", async ({ page }) => {
    await page.goto("/mitre");
    const matrix = main(page).getByTestId("matrix");
    await expect(matrix).toBeVisible();
    await expect(matrix.locator("[data-technique=T1059]")).toBeVisible();
    await expect(matrix.locator("[data-technique=T1059]")).toHaveAttribute("data-level", /[1-4]/);

    await main(page).getByTestId("view-coverage").click();
    await expect(main(page).getByTestId("gap-list")).toBeVisible();
    await main(page).getByTestId("view-techniques").click();
    await expect(main(page).getByRole("columnheader", { name: /Rules/ })).toBeVisible();
    await main(page).getByRole("link", { name: "ATLAS (AI)" }).click();
    await expect(page).toHaveURL(/fw=atlas/);
  });
});

test.describe("MITRE coverage from content", () => {
  test("shows what labs, detections and stories cover, and what lacks tests", async ({ page }) => {
    await page.goto("/mitre?view=content");
    const m = main(page);
    for (const id of ["labs", "detections", "stories", "lacking"]) {
      await expect(m.getByTestId(`coverage-${id}`)).toBeVisible();
    }
    await expect(m.getByTestId("coverage-stories")).toContainText("OS Credential Dumping");
    await expect(m.getByTestId("coverage-detections")).toContainText(
      "Command and Scripting Interpreter",
    );
    await expect(m.getByTestId("coverage-lacking")).toContainText(/of \d+/);
  });

  test("filters the matrix by platform", async ({ page }) => {
    await page.goto("/mitre");
    const m = main(page);
    await expect(m.locator("[data-technique=T1059]")).toBeVisible();
    await m.getByTestId("domain-web").click();
    await expect(page).toHaveURL(/domain=Web/);
    await expect(m.getByTestId("matrix").locator("[data-technique=T1190]")).toBeVisible();
    await expect(m.getByTestId("matrix").locator("[data-technique=T1547]")).toHaveCount(0);
    await m.getByTestId("domain-cloud").click();
    await expect(m.getByTestId("matrix").locator("[data-technique=T1078]").first()).toBeVisible();
    await expect(m.getByTestId("domain-filters").getByRole("link", { name: "All" })).toBeVisible();
  });

  test("adds story and test columns to the technique table, with a lacking-tests filter", async ({
    page,
  }) => {
    await page.goto("/mitre?view=techniques");
    const m = main(page);
    await expect(m.getByRole("columnheader", { name: /Stories/ })).toBeVisible();
    await expect(m.getByRole("columnheader", { name: /Tested/ })).toBeVisible();
    await page.goto("/mitre?view=techniques&domain=AI%20Security&fw=atlas");
    await expect(main(page).getByRole("link", { name: "AML.T0051" }).first()).toBeVisible();
  });
});

test.describe("AI security", () => {
  test("explains the trust-boundary chain and its findings", async ({ page }) => {
    await page.goto("/ai-security");
    await expect(main(page).getByRole("heading", { name: "AI security" })).toBeVisible();
    // Role locators only see the visible chain; `[data-boundary]` also matches the hidden copy
    // Next.js keeps in the DOM while a streamed Suspense boundary is being swapped in.
    await expect(main(page).getByTestId("boundary-detail")).toBeVisible();
    await main(page)
      .getByRole("button", { name: /^Tool boundary/ })
      .click();
    await expect(main(page).getByTestId("boundary-detail")).toContainText("Tool boundary");
    await main(page)
      .getByRole("button", { name: /^Resource boundary/ })
      .click();
    await expect(main(page).getByTestId("boundary-detail")).toContainText(
      "Where the boundary fails",
    );

    await main(page)
      .getByRole("link", { name: /Findings/ })
      .first()
      .click();
    await expect(main(page).getByTestId("finding-row").first()).toBeVisible();
  });
});

test.describe("learning and threat intelligence", () => {
  test("tracks learning progress locally and keeps it after a reload", async ({ page }) => {
    await page.goto("/learn/30-days");
    await expect(main(page).getByTestId("day-grid").getByRole("listitem")).toHaveCount(30);
    await page.goto("/learn/30-days/day-04");
    await expect(main(page).getByRole("heading", { name: "Sigma" })).toBeVisible();
    await main(page).getByTestId("complete-module").click();
    await expect(main(page).getByTestId("complete-module")).toHaveAttribute("aria-pressed", "true");

    await page.reload();
    await expect(main(page).getByTestId("complete-module")).toHaveAttribute("aria-pressed", "true");
    await page.goto("/learn/30-days");
    await expect(main(page).getByTestId("track-progress")).toContainText("1/30");
  });

  test("searches indicators and imports one without any external lookup", async ({ page }) => {
    await page.goto("/threat-intel");
    await expect(main(page).getByText(/never sent to third parties/)).toBeVisible();
    await main(page).getByLabel("Search indicators").fill("203.0.113.77");
    await expect(main(page).getByTestId("indicator-row")).toHaveCount(1);
    await main(page).getByTestId("indicator-row").getByRole("link").click();
    await expect(main(page).getByTestId("indicator-detail")).toContainText("Related alerts");

    await page.goto("/threat-intel");
    await main(page).getByTestId("import-indicator").click();
    await page.getByLabel("Value").fill("198.51.100.222");
    await page.getByLabel("Tags (comma separated)").fill("e2e, manual");
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText("Indicator imported")).toBeVisible();
  });
});
