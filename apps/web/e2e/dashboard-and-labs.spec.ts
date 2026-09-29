import { expect, test } from "@playwright/test";

import { main } from "./helpers";

test.describe("dashboard and cyber range", () => {
  test("opens the dashboard with KPIs, the timeline and a synthetic-data notice", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(main(page).getByRole("heading", { name: "Security dashboard" })).toBeVisible();
    for (const label of [
      "Security posture",
      "Active labs",
      "Open alerts",
      "Detection rules",
      "MITRE techniques covered",
      "Events processed",
    ]) {
      await expect(main(page).getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(main(page).getByText("Security event timeline")).toBeVisible();
    await expect(main(page).getByText(/All telemetry on this page is synthetic/)).toBeVisible();
    await expect(page.getByText("Demo data").first()).toBeVisible();
    await expect(main(page).getByRole("link", { name: "Open the lifecycle view" })).toBeVisible();
  });

  test("browses the twenty labs and filters them", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Labs", exact: true }).click();
    await expect(page).toHaveURL(/\/labs/);
    await expect(main(page).getByTestId("lab-grid").getByRole("listitem")).toHaveCount(20);

    await main(page).getByLabel("Domain", { exact: false }).selectOption("ai-security");
    await expect(page).toHaveURL(/domain=ai-security/);
    await expect(main(page).getByTestId("lab-grid").getByRole("listitem")).toHaveCount(5);

    await main(page).getByRole("button", { name: "Clear filters" }).click();
    await expect(main(page).getByTestId("lab-grid").getByRole("listitem")).toHaveCount(20);
  });

  test("opens a lab with the full lab structure", async ({ page }) => {
    await page.goto("/labs/suspicious-powershell-detection-simulation");
    await expect(
      main(page).getByRole("heading", { name: "Suspicious PowerShell Detection Simulation" }),
    ).toBeVisible();
    for (const tab of [
      "Overview",
      "Setup & telemetry",
      "Attack simulation",
      "Detection",
      "Investigate",
      "Mitigate & cleanup",
    ]) {
      await expect(main(page).getByRole("tab", { name: tab })).toBeVisible();
    }
    await main(page).getByRole("tab", { name: "Attack simulation" }).click();
    await expect(main(page).getByText("Safety boundary")).toBeVisible();
    await main(page).getByRole("tab", { name: "Investigate" }).click();
    await expect(main(page).getByText("Investigation questions")).toBeVisible();
  });

  test("command palette searches across content types (Ctrl+K)", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Control+k");
    const input = page.getByPlaceholder(/Search labs, rules, techniques/);
    await expect(input).toBeVisible();
    await input.fill("encoded command");
    const result = page.getByRole("option", { name: /PowerShell Launched With Encoded Command/ });
    await expect(result.first()).toBeVisible();
    await result.first().click();
    await expect(page).toHaveURL(/\/detections\/win-encoded-powershell-command/);
  });

  test("keyboard shortcuts navigate (g then a)", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("g");
    await page.keyboard.press("s");
    await expect(page).toHaveURL(/\/soc\/alerts/);
  });

  test("theme can be switched", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
    await expect(html).toHaveClass(/light|dark/);
    const first = await html.getAttribute("class");
    await page.getByRole("button", { name: /Switch to (light|dark) theme/ }).click();
    await expect(html).not.toHaveAttribute("class", first ?? "");
  });
});
