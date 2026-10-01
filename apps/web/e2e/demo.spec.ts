import { expect, test } from "@playwright/test";

import { main } from "./helpers";

test.describe("demo mode", () => {
  test("starts paused at zero, with no external requests needed", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      const url = new URL(r.url());
      if (!["localhost", "127.0.0.1"].includes(url.hostname)) external.push(r.url());
    });
    await page.goto("/demo");
    const m = main(page);
    await expect(m.getByTestId("demo-elapsed")).toHaveText("00:00 / 01:20");
    await expect(m.getByTestId("demo-start")).toBeVisible();
    await expect(m.getByTestId("events-count")).toContainText("0 of");
    await expect(m.getByTestId("severity-current")).toHaveText("Quiet");
    expect(external).toEqual([]);
  });

  test("plays: telemetry, detections, alerts, MITRE, notes, containment and a summary", async ({
    page,
  }) => {
    await page.goto("/demo?speed=4");
    const m = main(page);
    await expect(m.getByTestId("demo-speed-4")).toHaveAttribute("aria-pressed", "true");
    await m.getByTestId("demo-start").click();

    // Ingestion begins, then the first alert, then severity escalates.
    await expect(m.getByTestId("demo-event").first()).toBeVisible();
    await expect(m.getByTestId("alert-row").first()).toBeVisible({ timeout: 15_000 });
    await expect(m.getByTestId("severity-current")).toHaveAttribute("data-severity", "high", {
      timeout: 15_000,
    });
    await expect(m.getByTestId("severity-current")).toHaveAttribute("data-severity", "critical", {
      timeout: 20_000,
    });
    await expect(m.locator("[data-testid=mitre-cell][data-tactic=TA0006]")).toHaveAttribute(
      "data-count",
      "1",
    );
    await expect(m.getByTestId("process-chain")).toContainText("WINWORD.EXE");
    await expect(m.getByTestId("containment-state")).toHaveAttribute("data-state", "contained", {
      timeout: 20_000,
    });
    await expect(m.getByTestId("demo-notes")).toContainText("LSASS");

    // The incident summary is written when the incident is contained.
    await expect(m.getByTestId("incident-summary")).toHaveAttribute("data-ready", "true", {
      timeout: 30_000,
    });
    await expect(m.getByTestId("summary-headline")).toContainText("Critical-severity incident");
    await expect(m.getByTestId("demo-start")).toHaveText(/Replay/);
    await expect(m.getByTestId("alerts-count")).toHaveText("7 raised");
  });

  test("pauses, resumes and resets", async ({ page }) => {
    await page.goto("/demo?t=10&speed=1");
    const m = main(page);
    await expect(m.getByTestId("demo-elapsed")).toHaveText("00:10 / 01:20");
    await m.getByTestId("demo-start").click();
    await expect(m.getByTestId("demo-pause")).toBeVisible();
    await page.waitForTimeout(1500);
    await m.getByTestId("demo-pause").click();
    const paused = await m.getByTestId("demo-elapsed").innerText();
    await page.waitForTimeout(1200);
    await expect(m.getByTestId("demo-elapsed")).toHaveText(paused); // frozen while paused
    await expect(m.getByTestId("demo-start")).toHaveText(/Resume/);

    await m.getByTestId("demo-reset").click();
    await expect(m.getByTestId("demo-elapsed")).toHaveText("00:00 / 01:20");
    await expect(m.getByTestId("alert-row")).toHaveCount(0);
  });

  test("a given moment always looks the same (deterministic)", async ({ page }) => {
    const snapshot = async () => {
      await page.goto("/demo?t=52");
      const m = main(page);
      await expect(m.getByTestId("alerts-count")).toHaveText("7 raised");
      return {
        clock: await m.getByTestId("demo-clock").innerText(),
        events: await m.getByTestId("events-count").innerText(),
        alerts: await m.getByTestId("alert-row").allInnerTexts(),
        severity: await m.getByTestId("severity-history").innerText(),
        notes: await m.getByTestId("demo-notes").innerText(),
      };
    };
    const first = await snapshot();
    const second = await snapshot();
    expect(second).toEqual(first);
    expect(first.clock).toBe("09:14:52");
    expect(first.severity).toBe("high → critical");
  });

  test("timeline position can be linked to, for screenshots", async ({ page }) => {
    await page.goto("/demo?t=70");
    const m = main(page);
    await expect(m.getByTestId("incident-summary")).toHaveAttribute("data-ready", "false");
    await page.goto("/demo?t=76");
    await expect(main(page).getByTestId("incident-summary")).toHaveAttribute("data-ready", "true");
  });

  test("is operable with the keyboard", async ({ page }) => {
    await page.goto("/demo");
    const m = main(page);
    await m.getByTestId("demo-speed-2").focus();
    await page.keyboard.press("Enter");
    await expect(m.getByTestId("demo-speed-2")).toHaveAttribute("aria-pressed", "true");
    await m.getByTestId("demo-start").focus();
    await page.keyboard.press("Enter");
    await expect(m.getByTestId("demo-pause")).toBeVisible();
    await page.keyboard.press("Enter"); // the focus stays on the toggle
    await expect(m.getByTestId("demo-start")).toBeVisible();
  });
});
