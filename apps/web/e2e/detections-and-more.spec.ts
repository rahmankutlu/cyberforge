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
  test("validates a good rule and reports fields and MITRE mappings", async ({ page }) => {
    await page.goto("/detections/playground");
    await main(page).getByTestId("validate-rule").click();
    await expect(main(page).getByTestId("valid-badge")).toBeVisible();
    await expect(main(page).getByTestId("fields-detected")).toContainText("CommandLine");
    await expect(main(page).getByTestId("mitre-mappings")).toContainText("T1059.001");
    await expect(main(page).getByText("Potential false positives")).toBeVisible();
  });

  test("reports syntax errors for an invalid rule", async ({ page }) => {
    await page.goto("/detections/playground");
    await main(page)
      .getByTestId("rule-editor")
      .fill(
        "title: Broken\nlogsource:\n  product: windows\ndetection:\n  sel:\n    Image|bogus: x\n  condition: sel\n",
      );
    await main(page).getByTestId("validate-rule").click();
    await expect(main(page).getByTestId("invalid-badge")).toBeVisible();
    await expect(main(page).getByRole("list", { name: "Errors" })).toContainText(/bogus/i);
  });

  test("translates a Sigma rule to every target", async ({ page }) => {
    await page.goto("/detections/playground");
    await main(page).getByTestId("translate-rule").click();
    await expect(main(page).getByTestId("translation-elastic")).toContainText("powershell.exe");
    await main(page).getByTestId("target-splunk").click();
    await expect(main(page).getByTestId("translation-splunk")).toContainText("Image");
    await main(page).getByTestId("target-sentinel").click();
    await expect(main(page).getByTestId("translation-sentinel")).toContainText("endswith");
    await main(page).getByTestId("target-opensearch").click();
    await expect(main(page).getByTestId("translation-opensearch")).toBeVisible();
    await main(page).getByTestId("target-sql").click();
    await expect(main(page).getByTestId("translation-sql")).toContainText("SELECT");
  });

  test("tests a rule against a lab scenario", async ({ page }) => {
    await page.goto("/detections/playground");
    await main(page).getByRole("tab", { name: "Test against events" }).click();
    await main(page).getByLabel("Events from").selectOption("lab");
    await main(page)
      .getByLabel("Lab", { exact: true })
      .selectOption("suspicious-powershell-detection-simulation");
    await main(page).getByTestId("test-rule").click();
    await expect(main(page).getByTestId("matched-count")).toHaveText("1");
  });

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

  test("lists 65 rules across Sigma, YARA and Suricata", async ({ page }) => {
    await page.goto("/detections");
    await expect(main(page).getByText(/of 65 rules/)).toBeVisible();
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

test.describe("AI security", () => {
  test("explains the trust-boundary chain and its findings", async ({ page }) => {
    await page.goto("/ai-security");
    await expect(main(page).getByRole("heading", { name: "AI security" })).toBeVisible();
    await page.locator("[data-boundary=tool]").click();
    await expect(main(page).getByTestId("boundary-detail")).toContainText("Tool boundary");
    await page.locator("[data-boundary=resource]").click();
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
