import { expect, test } from "@playwright/test";

import { main } from "./helpers";

test.describe("mini SOC", () => {
  test("filters the alert queue with URL-backed severity chips and sortable headers", async ({
    page,
  }) => {
    await page.goto("/soc/alerts");
    const rows = main(page).getByTestId("alert-row");
    await expect(rows.first()).toBeVisible();

    await main(page)
      .getByRole("button", { name: /^Critical/ })
      .click();
    await expect(page).toHaveURL(/severity=critical/);
    await expect(rows.first().getByText("Critical")).toBeVisible();
    const critical = await rows.count();
    for (let i = 0; i < critical; i++) await expect(rows.nth(i)).toContainText("Critical");

    await main(page).getByRole("link", { name: /Alert/, exact: false }).first().waitFor();
    await main(page).getByRole("columnheader", { name: /Alert/ }).getByRole("link").click();
    await expect(page).toHaveURL(/sort=title/);

    await main(page).getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/severity=/);
  });

  test("remembers filters between visits", async ({ page }) => {
    await page.goto("/soc/alerts?status=resolved");
    await expect(main(page).getByTestId("alert-row").first()).toBeVisible();
    await page.goto("/");
    await page.goto("/soc/alerts");
    await expect(page).toHaveURL(/status=resolved/);
  });

  test("triages an alert: status, assignee, note, AI fallback", async ({ page }) => {
    await page.goto("/soc/alerts?status=new");
    await main(page).getByTestId("alert-row").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/soc\/alerts\/\d+/);

    await main(page).getByTestId("status-select").selectOption("investigating");
    await expect(page.getByText("Status set to Investigating")).toBeVisible();
    await main(page)
      .getByTestId("assignee-select")
      .selectOption({ label: "Kai Thorne · Detection Engineer" });
    await expect(page.getByText("Assigned to Kai Thorne")).toBeVisible();

    await main(page).getByTestId("tab-notes").click();
    await main(page)
      .getByLabel("Add an analyst note")
      .fill("E2E: reviewed raw event, matches the rule; escalating.");
    await main(page).getByRole("button", { name: "Add note" }).click();
    await expect(main(page).getByTestId("notes-list")).toContainText("E2E: reviewed raw event");

    // AI is optional: with no provider configured the UI explains why instead of failing.
    await main(page).getByTestId("tab-ai").click();
    await main(page).getByTestId("analyze-ai").click();
    await expect(main(page).getByText("AI analysis is unavailable")).toBeVisible();
    await expect(
      main(page)
        .getByText(/not configured/i)
        .first(),
    ).toBeVisible();
  });

  test("creates an investigation from an alert, adds notes, a timeline entry and exports the report", async ({
    page,
  }) => {
    await page.goto("/soc/alerts?status=new");
    await main(page).getByTestId("alert-row").first().getByRole("link").first().click();
    await main(page).getByRole("button", { name: "Create investigation" }).click();
    await expect(page).toHaveURL(/\/soc\/investigations\/\d+/);
    await expect(main(page).getByRole("heading", { level: 1 })).toContainText("Investigation:");

    await main(page).getByTestId("inv-tab-notes").click();
    await main(page).getByLabel("Add an analyst note").fill("E2E: contacted the asset owner.");
    await main(page).getByRole("button", { name: "Add note" }).click();
    await expect(main(page).getByTestId("notes-list")).toContainText("contacted the asset owner");

    await main(page)
      .getByRole("tab", { name: /Timeline/ })
      .click();
    await main(page).getByLabel("Entry title").fill("Host isolated from the network");
    await main(page).getByRole("button", { name: "Add entry" }).click();
    await expect(main(page).getByTestId("timeline")).toContainText(
      "Host isolated from the network",
    );

    await main(page).getByTestId("inv-tab-report").click();
    await main(page)
      .getByLabel("Executive summary")
      .fill("E2E: one host affected; contained within the hour.");
    await main(page).getByLabel("Root cause").fill("Weak credential.");
    await main(page).getByTestId("save-report").click();
    await expect(page.getByText("Report saved")).toBeVisible();

    const markdown = main(page).getByTestId("export-markdown");
    await expect(markdown).toHaveAttribute("href", /\/report\/export\?format=markdown/);
    const download = page.waitForEvent("download");
    await markdown.click();
    expect((await download).suggestedFilename()).toMatch(/^incident-\d+\.md$/);
    await expect(main(page).getByTestId("export-json")).toHaveAttribute("href", /format=json/);

    await main(page).getByRole("tab", { name: "Preview" }).click();
    await expect(main(page).getByTestId("report-preview")).toContainText("E2E: one host affected");
  });

  test("browses events and expands a raw log line", async ({ page }) => {
    await page.goto("/soc/events?source=sysmon");
    const row = main(page).getByTestId("event-row").first();
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Show raw event" }).click();
    await expect(main(page).getByText("Parsed fields", { exact: true })).toBeVisible();
    await expect(page.locator("pre").first()).toContainText("EventID");
  });
});
