import { expect, test } from "@playwright/test";

import { main } from "./helpers";

const BROKEN_RULE =
  "title: Broken\nlogsource:\n  product: windows\ndetection:\n  sel:\n    Image|bogus: x\n  condition: sel\n";

test.describe("detection playground", () => {
  test("opens populated and explains the default match", async ({ page }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1");
    await expect(m.getByTestId("match-outcome")).toHaveAttribute("data-outcome", "MATCHED");

    // Selector, field, matched value and the condition path are all on screen.
    const why = m.getByTestId("why-matched");
    await expect(why).toContainText("selection_flag");
    await expect(why).toContainText("CommandLine");
    await expect(why).toContainText("-enc");
    await expect(m.getByTestId("selection-filter_management")).toHaveAttribute(
      "data-matched",
      "false",
    );
    await expect(m.getByTestId("condition-path")).toContainText("selection_image");
    await expect(m.getByTestId("trace-result")).toContainText("MATCHED");
    await expect(m.getByTestId("fp-hints")).toContainText("false positive");
  });

  test("explains why an excluded event did not match", async ({ page }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1");
    // The second event is encoded PowerShell started by the endpoint-management agent.
    await m.getByRole("button", { name: /^Event 2:/ }).click();
    await expect(m.getByTestId("match-outcome")).toHaveAttribute("data-outcome", "NO MATCH");
    await expect(m.getByTestId("match-outcome")).toContainText("filter_management");
    await expect(m.getByTestId("selection-filter_management")).toHaveAttribute(
      "data-matched",
      "true",
    );
  });

  test("filters events and moves through them with the keyboard", async ({ page }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1");
    await m.getByTestId("filter-matched").click();
    await expect(m.getByTestId("event-row")).toHaveCount(1);
    await m.getByTestId("filter-all").click();
    const rows = m.getByTestId("event-row");
    expect(await rows.count()).toBeGreaterThan(10);

    await m.getByRole("button", { name: /^Event 1:/ }).click();
    await expect(m.getByRole("button", { name: /^Event 1:/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await page.keyboard.press("ArrowDown");
    await expect(m.getByRole("button", { name: /^Event 2:/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(m.getByRole("button", { name: /^Event 1:/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("reports errors for an invalid rule and recovers when it is fixed", async ({ page }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1"); // hydrated and auto-run finished
    await m.getByTestId("rule-editor").fill(BROKEN_RULE);
    await m.getByTestId("run-rule").click();
    await expect(m.getByTestId("rule-errors")).toContainText(/bogus/i);
    await expect(m.getByTestId("run-summary")).toContainText("not valid");
  });

  test("runs a rule with the keyboard shortcut", async ({ page }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1");
    await m.getByTestId("rule-editor").fill(BROKEN_RULE);
    await m.getByTestId("rule-editor").press("Control+Enter");
    await expect(m.getByTestId("rule-errors")).toBeVisible();
  });

  test("translates a Sigma rule to every target", async ({ page }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1");
    await m.getByTestId("tab-translations").click();
    await expect(m.getByTestId("translation-elastic")).toContainText("powershell.exe");
    await m.getByTestId("target-splunk").click();
    await expect(m.getByTestId("translation-splunk")).toContainText("Image");
    await m.getByTestId("target-sentinel").click();
    await expect(m.getByTestId("translation-sentinel")).toContainText("endswith");
    await m.getByTestId("target-sql").click();
    await expect(m.getByTestId("translation-sql")).toContainText("SELECT");
  });

  test("maps fields to each SIEM's schema and lets you change the pipeline", async ({ page }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1");
    await m.getByTestId("tab-translations").click();

    // Elastic: the ECS pipeline renames the fields and says what it did.
    await expect(m.getByTestId("pipeline-badge-elastic")).toContainText(
      "Mapped with ECS (Windows)",
    );
    await expect(m.getByTestId("translation-elastic")).toContainText("process.command_line");
    await expect(m.getByTestId("field-mapping-elastic")).toContainText("CommandLine");
    await expect(m.getByTestId("field-mapping-elastic")).toContainText("process.command_line");

    // Switching to "None" gives the unmapped query back.
    await m.getByTestId("pipeline-elastic").selectOption("none");
    await expect(m.getByTestId("pipeline-badge-elastic")).toContainText("Field names unchanged");
    await expect(m.getByTestId("translation-elastic")).toContainText("CommandLine");
    await expect(m.getByTestId("field-mapping-elastic")).toHaveCount(0);

    // Sentinel: "auto" skips ASIM, which has no equivalent for OriginalFileName, and finds Defender XDR.
    await m.getByTestId("target-sentinel").click();
    await expect(m.getByTestId("pipeline-badge-sentinel")).toContainText("Microsoft Defender XDR");
    await expect(m.getByTestId("translation-sentinel")).toContainText("ProcessCommandLine");

    // Asking for ASIM explicitly explains the refusal and still shows the unmapped query.
    await m.getByTestId("pipeline-sentinel").selectOption("sentinel_asim");
    await expect(m.getByTestId("pipeline-error-sentinel")).toContainText("could not map this rule");
    await expect(m.getByTestId("pipeline-error-sentinel")).toContainText("Microsoft Sentinel ASIM");
    await expect(m.getByTestId("translation-sentinel")).toContainText("CommandLine");
  });

  test("shows the MITRE mapping and dataset relevance", async ({ page }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1");
    await m.getByTestId("tab-mitre").click();
    await expect(m.getByTestId("mitre-panel")).toContainText("T1059.001");
    await expect(m.getByTestId("mitre-panel")).toContainText("This dataset exercises");
  });

  test("notes tab shows false positives and keeps private notes in the browser", async ({
    page,
  }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1");
    await m.getByTestId("tab-notes").click();
    await expect(m.getByTestId("rule-notes")).toContainText("Endpoint management");
    await m.getByLabel(/Your notes/).fill("filter the SCCM agent");
    await page.reload();
    await main(page).getByTestId("tab-notes").click();
    await expect(main(page).getByLabel(/Your notes/)).toHaveValue("filter the SCCM agent");
  });

  test("switches dataset and loads a rule the dataset is expected to trigger", async ({ page }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1"); // hydrated
    await m.getByTestId("dataset-select").selectOption("web-shell-telemetry");
    await m.getByRole("button", { name: /Script In Upload Directory/ }).click();
    await expect(m.getByTestId("matched-count")).toHaveText("2");
    await expect(m.getByTestId("match-outcome")).toHaveAttribute("data-outcome", "MATCHED");
  });

  test("evaluates correlation rules and explains group membership", async ({ page }) => {
    await page.goto("/detections/playground?rule=win-failed-logon-burst");
    const m = main(page);
    await expect(m.getByTestId("run-summary")).toContainText("correlation hit");
    await expect(m.getByTestId("correlation-trace")).toContainText("event_count");
    await expect(m.getByTestId("match-outcome")).toHaveAttribute(
      "data-outcome",
      "PART OF A CORRELATION HIT",
    );
  });

  test("previews a YARA rule against file samples", async ({ page }) => {
    await page.goto("/detections/playground?rule=yara-cyberforge-lab-canary-token");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1");
    await expect(m.getByTestId("yara-trace")).toContainText("$canary");
    await expect(m.getByTestId("match-outcome")).toHaveAttribute("data-outcome", "MATCHED");
  });

  test("previews a Suricata rule against HTTP logs", async ({ page }) => {
    await page.goto("/detections/playground?rule=suricata-9000004");
    const m = main(page);
    await expect(m.getByTestId("suricata-trace")).toBeVisible();
    await expect(m.getByTestId("run-summary")).toContainText("events matched");
  });

  test("tests a custom event and keeps working after a bad JSON edit", async ({ page }) => {
    await page.goto("/detections/playground");
    const m = main(page);
    await expect(m.getByTestId("matched-count")).toHaveText("1"); // hydrated
    await m.getByTestId("dataset-select").selectOption("__custom__");
    await expect(m.getByTestId("custom-events")).toBeVisible();
    await m.getByTestId("run-rule").click();
    await expect(m.getByTestId("run-summary")).toContainText("1 of 2 events matched");
    await m.getByTestId("custom-events").fill("[ not json");
    await m.getByTestId("run-rule").click();
    await expect(page.getByText(/must be valid JSON/)).toBeVisible();
  });
});
