import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const { chromium, expect } = require("@playwright/test");
const { default: AxeBuilder } = require("@axe-core/playwright");
const files = {
  "": ["index.html", "text/html"],
  "demo.css": ["demo.css", "text/css"],
  "demo.js": ["demo.js", "text/javascript"],
  "data.js": ["data.js", "text/javascript"],
  "icon.svg": ["icon.svg", "image/svg+xml"],
};

const hostedUrl = process.argv[2];
const demoPath = "/cyberforge/";
const server = hostedUrl
  ? undefined
  : createServer(async (request, response) => {
      const path = request.url ?? "";
      const key = path.slice(demoPath.length);
      if (!path.startsWith(demoPath) || !Object.hasOwn(files, key)) {
        response.writeHead(404).end();
        return;
      }
      const [name, contentType] = files[key];
      const body = await readFile(new URL(`../dist/public-demo/${name}`, import.meta.url));
      response.writeHead(200, { "Content-Type": contentType }).end(body);
    });
if (server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
}
const url = new URL(hostedUrl ?? `http://127.0.0.1:${server.address().port}${demoPath}`);
const allowed = new Set(Object.keys(files).map((path) => new URL(path, url).href));

let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(20000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() !== "GET" || !allowed.has(request.url())) {
      errors.push(`Unexpected browser request: ${request.method()} ${request.url()}`);
    }
  });

  const response = await page.goto(url.href);
  assert.equal(response?.status(), 200);
  const queue = page.getByRole("region", { name: "Event queue" });
  const evidence = page.getByRole("tabpanel", { name: "Evidence" });
  const trace = page.getByRole("tabpanel", { name: "Sigma trace" });
  const brief = page.getByRole("tabpanel", { name: "Case brief" });
  const inspectEvent = (title) =>
    queue.getByRole("button", { name: new RegExp(`^${title}`) }).click();
  await expect(page.getByRole("heading", { name: "Cloud access investigation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Root console sign-in" })).toBeVisible();
  await expect(page.locator("#event-count")).toHaveText("8");
  await expect(page.locator("#detection-count")).toHaveText("6");
  await expect(queue.locator("li:visible")).toHaveCount(8);
  await evidence.getByText("Raw event fields").click();
  await expect(evidence.getByLabel("CloudTrail event JSON")).toContainText("198.51.100.15");
  await evidence.getByText("Raw event fields").click();

  await queue.getByRole("button", { name: "Detections", exact: true }).click();
  await expect(queue.locator("li:visible")).toHaveCount(6);
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.locator("#review-count")).toHaveText("1");
  await expect(queue.getByRole("button", { name: /Root console sign-in.*Reviewed/ })).toBeVisible();

  await page.getByRole("tab", { name: "Evidence" }).press("ArrowRight");
  await expect(trace.getByText("Rule matched")).toBeVisible();
  await expect(trace.getByText("userIdentity.type", { exact: true })).toBeVisible();
  await inspectEvent("Access key created for another identity");
  await expect(trace.getByText("filter_self", { exact: true })).toBeVisible();
  await expect(trace.getByText("userIdentity.userName = dev-bob", { exact: true })).toBeVisible();
  await expect(trace.getByText("svc-deploy", { exact: true })).toBeVisible();

  await queue.getByRole("button", { name: "All events" }).click();
  await inspectEvent("Expected IAM sign-in");
  await expect(trace.getByText("No match", { exact: true })).toBeVisible();
  await expect(trace.getByText("filter_expected", { exact: true })).toBeVisible();
  await inspectEvent("Unexpected IAM sign-in");
  await expect(trace.getByText("Rule matched")).toBeVisible();
  await expect(trace.getByText("selection and not filter_expected", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Case brief" }).click();
  await brief.getByRole("button", { name: "Bucket access widened" }).click();
  await expect(brief.getByRole("status")).toContainText("Look for an event");
  await brief.getByRole("button", { name: "Audit trail stopped" }).click();
  await expect(brief.getByRole("status")).toContainText("Correct");
  await brief.getByRole("button", { name: "Inspect audit trail evidence" }).click();
  await expect(page.getByRole("heading", { name: "Audit trail stopped" })).toBeVisible();
  await expect(evidence.getByText("management-events", { exact: true })).toBeVisible();

  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:01:00Z"));
  await page.getByLabel("Replay speed").selectOption("2");
  await page.getByRole("button", { name: "Play replay" }).dispatchEvent("click");
  await expect(page.getByRole("heading", { name: "Routine inventory read" })).toBeVisible();
  await expect(page.locator("#detection-count")).toHaveText("0");
  await queue.getByRole("button", { name: "Detections", exact: true }).dispatchEvent("click");
  await expect(queue.getByText("Detections will appear")).toBeVisible();
  await page.clock.fastForward(650);
  await expect(page.getByRole("heading", { name: "Expected IAM sign-in" })).toBeVisible();
  await page.getByRole("button", { name: "Pause replay" }).dispatchEvent("click");
  await page.clock.fastForward(1300);
  await expect(page.locator("#position")).toHaveText("2 / 8");
  await page.clock.resume();
  await page.getByRole("slider", { name: "Replay position" }).press("End");
  await expect(page.locator("#detection-count")).toHaveText("6");

  await page.getByRole("tab", { name: "Sigma trace" }).click();
  await trace.getByText("View rule YAML").click();
  await expect(trace.getByLabel("Sigma rule YAML")).toContainText("condition: selection");
  for (const width of [360, 320]) {
    await page.setViewportSize({ width, height: 780 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    accessibility.violations.map((violation) => violation.id),
    [],
  );
  assert.deepEqual(errors, []);
  console.log(
    `Public investigation passed trace, replay, review, triage, keyboard, mobile, accessibility and network checks at ${url}`,
  );
} finally {
  await browser?.close();
  server?.close();
}
