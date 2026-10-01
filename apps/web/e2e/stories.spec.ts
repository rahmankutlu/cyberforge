import { expect, test } from "@playwright/test";

import { main } from "./helpers";

const STORY = "/stories/compromised-developer-workstation";

test.describe("attack stories", () => {
  test("lists the five launch stories with their facts", async ({ page }) => {
    await page.goto("/stories");
    const grid = main(page).getByTestId("story-grid");
    for (const title of [
      "Compromised Developer Workstation",
      "Suspicious Admin Account Activity",
      "Web Application Intrusion",
      "Credential Abuse and Lateral Movement",
      "AI Agent Tool Abuse",
    ]) {
      await expect(grid.getByRole("heading", { name: title })).toBeVisible();
    }
    await expect(grid.locator("[data-story=compromised-developer-workstation]")).toContainText(
      "6 steps",
    );
    await grid.getByRole("link", { name: /Compromised Developer Workstation/ }).click();
    await expect(page).toHaveURL(/\/stories\/compromised-developer-workstation$/);
  });

  test("reveals evidence step by step and builds the investigation", async ({ page }) => {
    await page.goto(STORY);
    const m = main(page);
    await expect(m.getByTestId("briefing")).toContainText("DEV-WKS-07");
    await expect(m.getByTestId("story-step")).toHaveCount(1);
    await expect(m.getByTestId("steps-revealed")).toHaveText("1 of 6 steps revealed");
    await expect(m.getByTestId("story-flow").locator("[data-stage=alerts]")).toHaveAttribute(
      "data-count",
      "1",
    );
    await expect(m.getByTestId("detections")).toContainText(
      "Remote Desktop Logon From Public IP Address",
    );
    await expect(m.getByTestId("graph-panel")).toBeVisible();
    await expect(m.getByTestId("graph-text")).toContainText("connected to");

    await m.getByTestId("reveal-next").click();
    await expect(m.getByTestId("story-step")).toHaveCount(2);
    await expect(m.getByTestId("steps-revealed")).toHaveText("2 of 6 steps revealed");
    await expect(m.getByTestId("board-techniques")).toContainText("T1059.001");
    await expect(m.getByTestId("story-flow").locator("[data-stage=detections]")).toHaveAttribute(
      "data-count",
      "2",
    );
  });

  test("marks findings and answers investigation questions with feedback", async ({ page }) => {
    await page.goto(STORY);
    const m = main(page);
    const first = m.getByTestId("story-step").first();

    await first.locator("[data-evidence=hr-roster]").getByTestId("mark-finding").click();
    await expect(
      first.locator("[data-evidence=hr-roster]").getByTestId("finding-text"),
    ).toContainText("should not be working today");
    await expect(m.getByTestId("findings-count")).toHaveText("1");
    await expect(m.getByTestId("findings")).toContainText("HR leave roster");

    // Wrong answer first: it is explained, then locked.
    const question = first.getByTestId("question");
    await question.locator("[data-option=b]").check();
    await question.getByTestId("check-answer").click();
    await expect(question.getByTestId("answer-result")).toHaveAttribute("data-correct", "false");
    await expect(question).toContainText("tells you nothing here");
    await expect(question).toContainText("Correct.");
    await expect(question.locator("[data-option=a]")).toBeDisabled();
  });

  test("an analyst decision is final and gets feedback", async ({ page }) => {
    await page.goto(STORY);
    const m = main(page);
    await m.getByTestId("reveal-next").click();
    const decision = m.getByTestId("decision");
    await decision.locator("[data-option=wait]").click();
    await expect(decision.getByTestId("decision-feedback")).toHaveAttribute("data-quality", "poor");
    await expect(decision.getByTestId("decision-feedback")).toContainText("Stronger option");
    await decision
      .locator("[data-option=isolate]")
      .click({ force: true })
      .catch(() => undefined);
    await expect(decision.getByTestId("decision-feedback")).toHaveAttribute("data-quality", "poor");
  });

  test("progress survives a reload and can be reset", async ({ page }) => {
    await page.goto(STORY);
    const m = main(page);
    await m.getByTestId("reveal-next").click();
    await m.getByTestId("reveal-next").click();
    await expect(m.getByTestId("story-step")).toHaveCount(3);
    await page.reload();
    await expect(main(page).getByTestId("story-step")).toHaveCount(3);
    await main(page).getByTestId("reset-story").click();
    await expect(main(page).getByTestId("story-step")).toHaveCount(1);
  });

  test("runs a whole story: containment, explanation, review", async ({ page }) => {
    await page.goto(STORY);
    const m = main(page);
    await m.getByTestId("reveal-all").click();
    await expect(m.getByTestId("story-step")).toHaveCount(6);
    await expect(m.getByTestId("containment")).toBeVisible();
    await expect(m.getByTestId("postmortem")).toHaveCount(0);

    await m.locator("[data-action=isolate-host]").check();
    await m.locator("[data-action=reset-mchen]").check();
    await m.locator("[data-action=reimage-now]").check();
    await m.getByTestId("submit-containment").click();

    const feedback = m.getByTestId("containment-feedback");
    await expect(feedback).toHaveCount(3);
    await expect(m.locator("[data-quality=harmful]").first()).toContainText("Too early");
    await expect(m.getByTestId("containment-missed")).toContainText(
      "Recommended actions you did not choose",
    );

    const post = m.getByTestId("postmortem");
    await expect(post).toBeVisible();
    await expect(post.getByTestId("attack-chain")).toContainText("Credential Access");
    await expect(post.getByTestId("attack-chain")).toContainText("T1003.001");
    await expect(post.getByTestId("lessons").getByRole("listitem")).toHaveCount(4);
    await expect(post.getByTestId("review")).toContainText("Harmful actions chosen");
    await expect(m.getByTestId("story-flow").locator("[data-stage=lessons]")).toHaveAttribute(
      "data-count",
      "4",
    );
  });

  test("the explanation can be read without submitting a plan", async ({ page }) => {
    await page.goto("/stories/ai-agent-tool-abuse");
    const m = main(page);
    await m.getByTestId("reveal-all").click();
    await m.getByTestId("skip-review").click();
    await expect(m.getByTestId("postmortem")).toContainText(
      "The model cannot reliably separate data",
    );
  });

  test("is operable with the keyboard only", async ({ page }) => {
    await page.goto(STORY);
    const m = main(page);
    const first = m.getByTestId("story-step").first();
    await first.locator("[data-option=a]").focus();
    await page.keyboard.press("Space");
    await expect(first.locator("[data-option=a]")).toBeChecked();
    await first.getByTestId("check-answer").focus();
    await page.keyboard.press("Enter");
    await expect(first.getByTestId("answer-result")).toHaveAttribute("data-correct", "true");
    await m.getByTestId("reveal-next").focus();
    await page.keyboard.press("Enter");
    await expect(m.getByTestId("story-step")).toHaveCount(2);
  });

  test("shows a not-found page for an unknown story", async ({ page }) => {
    await page.goto("/stories/no-such-story");
    await expect(main(page).getByText("Not found", { exact: true })).toBeVisible();
  });
});
