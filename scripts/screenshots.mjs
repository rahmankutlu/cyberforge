#!/usr/bin/env node
// Captures the README / docs screenshots from a running CyberForge instance.
//
//   pnpm dev:api & pnpm --filter @cyberforge/web start &
//   node scripts/screenshots.mjs [baseUrl]
//
// Uses the browser named by PW_CHANNEL (default: bundled Chromium; set PW_CHANNEL=msedge or chrome
// to use an installed browser instead of downloading one).
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const base = process.argv[2] ?? "http://localhost:3000";
const out = join(root, "docs/assets/screenshots");
mkdirSync(out, { recursive: true });

const shots = [
  { name: "dashboard", path: "/", wait: "text=Security event timeline" },
  {
    name: "lifecycle",
    path: "/lifecycle",
    wait: "[data-testid=lifecycle]",
    click: "[data-stage=match]",
  },
  { name: "alerts", path: "/soc/alerts", wait: "[data-testid=alert-row]" },
  { name: "labs", path: "/labs", wait: "[data-testid=lab-grid]" },
  { name: "mitre", path: "/mitre", wait: "[data-testid=matrix]" },
  {
    name: "detection-playground",
    path: "/detections/playground",
    wait: "[data-testid=rule-editor]",
    action: "translate",
  },
  { name: "ai-security", path: "/ai-security", wait: "[data-testid=boundary-detail]" },
  {
    name: "investigation",
    path: "/soc/investigations/1?tab=report",
    wait: "[data-testid=save-report]",
  },
];

const themes = process.env.THEMES?.split(",") ?? ["dark", "light"];
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
try {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: theme,
    });
    await context.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
    const page = await context.newPage();
    for (const shot of shots) {
      await page.goto(base + shot.path, { waitUntil: "networkidle" });
      await page.waitForSelector(shot.wait, { timeout: 15000 });
      if (shot.click) await page.click(shot.click);
      if (shot.action === "translate") {
        await page.click("[data-testid=translate-rule]");
        await page.waitForSelector("[data-testid^=translation-]", { timeout: 15000 });
      }
      await page.waitForTimeout(400);
      const file = join(out, `${shot.name}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log("wrote", file);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
