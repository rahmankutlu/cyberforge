import { defineConfig, devices } from "@playwright/test";

// Dedicated ports so E2E never collides with a developer's running instance.
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 3100);
const API_PORT = Number(process.env.E2E_API_PORT ?? 8100);
const baseURL = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Tests share one seeded backend; keep them serial and independent of each other's data.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Set PW_CHANNEL=msedge (or chrome) to reuse an installed browser instead of downloading one.
    channel: process.env.PW_CHANNEL || undefined,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/serve-api.mjs",
      url: `http://127.0.0.1:${API_PORT}/ready`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { E2E_API_PORT: String(API_PORT) },
    },
    {
      command: "node e2e/serve-web.mjs",
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: { E2E_WEB_PORT: String(WEB_PORT), API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
