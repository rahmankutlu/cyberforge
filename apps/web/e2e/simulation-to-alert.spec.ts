import { expect, test } from "@playwright/test";

import { main } from "./helpers";

test.describe("attack → log → detection", () => {
  test("starts a safe simulation, generates telemetry and alerts, and opens the lifecycle", async ({
    page,
  }) => {
    await page.goto("/labs/brute-force-detection");
    await expect(main(page).getByRole("heading", { name: "Brute Force Detection" })).toBeVisible();

    await main(page).getByTestId("run-lab").click();
    const result = main(page).getByTestId("run-result");
    await expect(result).toBeVisible();
    await expect(main(page).getByTestId("run-alert-count")).toHaveText("6");
    await expect(result.getByText("Expected detections (5/5 fired)")).toBeVisible();

    // Open the first generated alert straight into its lifecycle.
    await result
      .getByRole("link", {
        name: /Failed Logons|Password Spraying|Remote Desktop|Administrator|Audit/,
      })
      .first()
      .click();
    await expect(page).toHaveURL(/\/soc\/alerts\/\d+\?tab=lifecycle/);
    const lifecycle = main(page).getByTestId("lifecycle");
    await expect(lifecycle).toBeVisible();
    await expect(lifecycle.getByRole("tab")).toHaveCount(8);
  });

  test("walks every lifecycle stage of the PowerShell alert", async ({ page }) => {
    await page.goto("/lifecycle");
    await expect(
      main(page)
        .getByRole("heading", { name: /Attack.*Detection/ })
        .first(),
    ).toBeVisible();
    const lifecycle = main(page).getByTestId("lifecycle");

    await lifecycle.getByRole("tab", { name: /Raw event/ }).click();
    const raw = main(page).getByTestId("raw-event");
    await expect(raw).toContainText("EventID");
    await expect(raw.locator("mark").first()).toBeVisible(); // matched values are highlighted

    await lifecycle.getByRole("tab", { name: /Parsed event/ }).click();
    await expect(main(page).getByTestId("field-map")).toContainText("matched");

    await lifecycle.getByRole("tab", { name: /Rule match/ }).click();
    await expect(main(page).getByTestId("match-trace")).toBeVisible();
    await expect(main(page).getByText("Potential false positives")).toBeVisible();

    await lifecycle.getByRole("tab", { name: /MITRE technique/ }).click();
    await expect(
      lifecycle
        .getByRole("tabpanel")
        .getByRole("link", { name: /^T\d{4}/ })
        .first(),
    ).toBeVisible();

    await lifecycle.getByRole("tab", { name: /Mitigation/ }).click();
    await expect(main(page).getByText("Analyst recommendations")).toBeVisible();

    await lifecycle.getByRole("button", { name: "Play" }).click();
    await expect(lifecycle.getByRole("tab", { name: /Simulation/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("shows the MITRE mapping of an alert and its technique page", async ({ page }) => {
    await page.goto("/soc/alerts?q=PowerShell%20Launched%20With%20Encoded");
    await main(page).getByTestId("alert-row").first().getByRole("link").first().click();
    await expect(page).toHaveURL(/\/soc\/alerts\/\d+/);

    await main(page)
      .getByRole("link", { name: /^T1059\.001/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/mitre\/T1059\.001/);
    await expect(main(page).getByRole("heading", { name: /PowerShell/ })).toBeVisible();
    const stats = main(page).getByTestId("technique-stats");
    await expect(stats).toContainText("Labs");
    await expect(stats).toContainText("Rules");
    await expect(main(page).getByText("Mapped detection rules")).toBeVisible();
  });

  test("generates demo telemetry from the dashboard", async ({ page }) => {
    await page.goto("/soc/alerts");
    const before = await main(page)
      .getByText(/\d+ open of (\d+) total/)
      .innerText();
    const totalBefore = Number(before.match(/of (\d+) total/)?.[1]);

    await page.goto("/");
    await main(page).getByRole("button", { name: "Generate demo telemetry" }).click();
    await expect(page.getByText("Telemetry generated")).toBeVisible();

    await page.goto("/soc/alerts");
    const after = await main(page)
      .getByText(/\d+ open of (\d+) total/)
      .innerText();
    expect(Number(after.match(/of (\d+) total/)?.[1])).toBeGreaterThan(totalBefore);
  });

  test("rejects an external simulation target (safety guardrail)", async ({ page }) => {
    await page.goto("/labs/brute-force-detection");
    await main(page).getByText("Target (optional)").click();
    await main(page).getByLabel("Lab target").fill("8.8.8.8");
    await main(page).getByTestId("run-lab").click();
    await expect(page.getByText("Simulation was not started")).toBeVisible();
    await expect(page.getByText(/never targets external hosts/)).toBeVisible();
  });
});
