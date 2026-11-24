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
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() !== "GET" || !allowed.has(request.url())) {
      errors.push(`Unexpected browser request: ${request.method()} ${request.url()}`);
    }
  });

  const response = await page.goto(url.href);
  assert.equal(response?.status(), 200);
  await expect(page.getByRole("heading", { name: "Why did this rule fire?" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("No match");
  await page.getByRole("slider", { name: "Seek to event" }).press("ArrowRight");
  await expect(page.getByRole("status")).toHaveText("Matched");
  await expect(page.getByRole("row", { name: "userIdentity.type Root Root Pass" })).toBeVisible();
  await expect(page.getByLabel("CloudTrail event fields")).toContainText("198.51.100.15");
  await page
    .getByRole("button", { name: /IAMUser sign-in/ })
    .last()
    .click();
  await expect(page.getByRole("status")).toHaveText("No match");
  await expect(
    page.getByRole("row", { name: "userIdentity.type Root IAMUser Fail" }),
  ).toBeVisible();

  await page.clock.install();
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(page.getByText("Event 1 of 3")).toBeVisible();
  await page.clock.fastForward(1600);
  await expect(page.getByRole("status")).toHaveText("Matched");
  await page.getByRole("button", { name: "Pause replay" }).click();
  await page.clock.fastForward(1600);
  await expect(page.getByText("Event 2 of 3")).toBeVisible();

  await page.setViewportSize({ width: 360, height: 780 });
  await page.getByText("View the Sigma rule").click();
  await expect(page.getByLabel("Sigma rule YAML")).toContainText("condition: selection");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    accessibility.violations.map((violation) => violation.id),
    [],
  );
  assert.deepEqual(errors, []);
  console.log(
    `Public demo passed replay, keyboard, narrow viewport, accessibility and network checks at ${url}`,
  );
} finally {
  await browser?.close();
  server?.close();
}
