import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      // Logic and components. Pages are Server Components exercised by the Playwright suite.
      include: ["src/lib/**", "src/components/**"],
      exclude: [
        "**/*.test.*",
        "src/test/**",
        "src/lib/i18n/tr-content.json",
        "src/lib/i18n/server.ts",
      ],
      reporter: ["text-summary"],
      // Floors set just under the measured values; they only move up. UI components are covered
      // end to end by Playwright, so the strict floor applies to the logic in src/lib.
      thresholds: {
        statements: 38,
        lines: 37,
        "src/lib/**": { statements: 80, lines: 80 },
      },
    },
  },
});
