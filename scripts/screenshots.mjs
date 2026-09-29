#!/usr/bin/env node
// Regenerates the README and docs visuals from a seeded CyberForge instance.
//
//   pnpm screenshots              start a fresh seeded API + production web build, capture, stop
//   pnpm screenshots --gif        ... and also record docs/assets/demo.gif
//   pnpm screenshots --url http://localhost:3000     reuse an instance that is already running
//   pnpm screenshots --only=dashboard,story-mode     capture only some shots
//
// Output:
//   docs/assets/dashboard.png, detection-playground.png, story-mode.png, mitre-coverage.png, demo.gif
//   docs/assets/screenshots/<name>-dark.png and <name>-light.png for every page
//
// Nothing is faked: every image is a real capture of the running app. Uses the browser named by
// PW_CHANNEL (default: bundled Chromium; PW_CHANNEL=msedge or chrome reuses an installed browser).
// See docs/demo-assets.md.
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(root, "apps/web/package.json"));
const { chromium } = require("@playwright/test");

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const urlArg = args.includes("--url") ? args[args.indexOf("--url") + 1] : undefined;
const only = value("only")?.split(",");
const themes = (process.env.THEMES ?? "dark,light").split(",");

const assets = join(root, "docs/assets");
const shotsDir = join(assets, "screenshots");
mkdirSync(shotsDir, { recursive: true });

// ── server management ──────────────────────────────────────────────────────────────────────
const children = [];
async function waitFor(url, label, timeoutMs = 300_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (children.some((c) => c.exitCode !== null))
      throw new Error(`${label}: a server process exited early (see its log above)`);
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

async function startStack() {
  const apiPort = process.env.SHOTS_API_PORT ?? "8200";
  const webPort = process.env.SHOTS_WEB_PORT ?? "3200";
  const env = {
    ...process.env,
    E2E_API_PORT: apiPort,
    E2E_WEB_PORT: webPort,
    E2E_DB: "screenshots.sqlite",
    API_INTERNAL_URL: `http://127.0.0.1:${apiPort}`,
  };
  const web = join(root, "apps/web");
  for (const script of ["e2e/serve-api.mjs", "e2e/serve-web.mjs"]) {
    const child = spawn(process.execPath, [join(web, script)], {
      cwd: web,
      env,
      stdio: ["ignore", "inherit", "inherit"],
    });
    children.push(child);
  }
  await waitFor(`http://127.0.0.1:${apiPort}/ready`, "API");
  await waitFor(`http://localhost:${webPort}/`, "web app");
  return `http://localhost:${webPort}`;
}

const stop = () => children.forEach((c) => c.kill());
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));

// ── the shots ──────────────────────────────────────────────────────────────────────────────
const STILL =
  "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";

/** Each shot: where to go, what to wait for, what to do first, and (optionally) a top-level name. */
const shots = [
  {
    name: "dashboard",
    path: "/",
    wait: "[data-testid=stream-row]",
    height: 1240,
    prepare: async (page) => {
      await page.waitForFunction(
        () => document.querySelectorAll("[data-testid=stream-row]").length >= 8,
        null,
        { timeout: 30_000 },
      );
    },
    canonical: "dashboard.png",
  },
  {
    name: "detection-playground",
    path: "/detections/playground",
    wait: "[data-testid=match-outcome]",
    canonical: "detection-playground.png",
  },
  {
    name: "story-mode",
    path: "/stories/compromised-developer-workstation",
    wait: "[data-testid=story-player]",
    height: 1300,
    prepare: async (page) => {
      const first = page.getByTestId("story-step").first();
      await first.locator("[data-evidence=hr-roster]").getByTestId("mark-finding").click();
      await first.getByTestId("question").locator("[data-option=a]").check();
      await first.getByTestId("check-answer").click();
      for (let i = 0; i < 3; i++) await page.getByTestId("reveal-next").click();
      await page.getByTestId("attack-graph").waitFor();
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.scrollTo(0, 0));
    },
    canonical: "story-mode.png",
  },
  {
    name: "mitre-coverage",
    path: "/mitre",
    wait: "[data-testid=matrix]",
    canonical: "mitre-coverage.png",
  },
  { name: "mitre-content", path: "/mitre?view=content", wait: "[data-testid=content-coverage]" },
  {
    name: "demo",
    path: "/demo?t=52",
    wait: "[data-testid=demo-alerts]",
  },
  {
    name: "rule-quality",
    path: "/detections/win-encoded-powershell-command",
    wait: "[data-testid=quality-card]",
    height: 1100,
  },
  {
    name: "lifecycle",
    path: "/lifecycle",
    wait: "[data-testid=lifecycle]",
    prepare: (p) => p.click("[data-stage=match]"),
  },
  { name: "alerts", path: "/soc/alerts", wait: "[data-testid=alert-row]" },
  { name: "labs", path: "/labs", wait: "[data-testid=lab-grid]" },
  { name: "ai-security", path: "/ai-security", wait: "[data-testid=boundary-detail]" },
  {
    name: "investigation",
    path: "/soc/investigations/1?tab=report",
    wait: "[data-testid=save-report]",
  },
].filter((s) => !only || only.includes(s.name));

async function capture(browser, base) {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: theme,
    });
    await context.addInitScript((t) => window.localStorage.setItem("theme", t), theme);
    const page = await context.newPage();
    for (const shot of shots) {
      await page.setViewportSize({ width: 1440, height: shot.height ?? 900 });
      await page.goto(base + shot.path, { waitUntil: "networkidle" });
      await page.addStyleTag({ content: STILL });
      await page.waitForSelector(shot.wait, { timeout: 30_000 });
      if (shot.prepare) await shot.prepare(page);
      await page.waitForTimeout(500);
      const file = join(shotsDir, `${shot.name}-${theme}.png`);
      await page.screenshot({ path: file, fullPage: false });
      console.log("wrote", file.replace(root, "").replace(/\\/g, "/"));
      if (theme === "dark" && shot.canonical) copyFileSync(file, join(assets, shot.canonical));
    }
    await context.close();
  }
}

// ── the demo GIF ───────────────────────────────────────────────────────────────────────────
/** Deterministic: step through the demo with ?t=, capture each second, encode a looping GIF. */
async function recordGif(browser, base) {
  const { PNG } = require(join(root, "node_modules/pngjs"));
  const { GIFEncoder, quantize, applyPalette } = require(join(root, "node_modules/gifenc"));
  const width = 1440;
  const height = 820;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  await context.addInitScript(() => window.localStorage.setItem("theme", "dark"));
  const page = await context.newPage();
  const step = Number(value("gif-step") ?? 2);
  const duration = 80;
  const gif = GIFEncoder();
  let previous = null;
  for (let t = 0; t <= duration; t += step) {
    await page.goto(`${base}/demo?t=${t}`, { waitUntil: "networkidle" });
    await page.addStyleTag({ content: STILL });
    await page.waitForSelector("[data-testid=demo-pipeline]");
    const png = PNG.sync.read(await page.screenshot({ type: "png" }));
    const rgba = new Uint8Array(png.data);
    // Unchanged pixels become transparent, which shrinks the file a great deal for a UI recording.
    const palette = quantize(rgba, 255, { format: "rgb444" });
    palette.push([0, 0, 0]);
    const index = applyPalette(rgba, palette, "rgb444");
    if (previous) {
      for (let i = 0; i < index.length; i++) {
        const o = i * 4;
        if (
          rgba[o] === previous[o] &&
          rgba[o + 1] === previous[o + 1] &&
          rgba[o + 2] === previous[o + 2]
        )
          index[i] = 255;
      }
    }
    const last = t + step > duration;
    gif.writeFrame(index, width, height, {
      palette,
      delay: last ? 3000 : 220,
      transparent: previous !== null,
      transparentIndex: 255,
      dispose: 1,
    });
    previous = rgba;
    process.stdout.write(`\rgif frame t=${t}s `);
  }
  gif.finish();
  const out = join(assets, "demo.gif");
  writeFileSync(out, gif.bytes());
  console.log(`\nwrote docs/assets/demo.gif (${(gif.bytes().length / 1024 / 1024).toFixed(2)} MB)`);
  await context.close();
}

// ── run ────────────────────────────────────────────────────────────────────────────────────
const base = urlArg ?? (await startStack());
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
try {
  if (!flag("gif-only")) await capture(browser, base);
  if (flag("gif") || flag("gif-only")) await recordGif(browser, base);
} finally {
  await browser.close();
  stop();
}
