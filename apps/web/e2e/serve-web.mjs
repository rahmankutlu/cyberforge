// Serves a production build of the web app for E2E tests.
// The API address is baked into the /api/v1 rewrite at build time, so the app is rebuilt against the
// E2E API on every run; set E2E_REUSE_BUILD=1 to skip that when iterating on a build you made yourself.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const webDir = resolve(import.meta.dirname, "..");
const port = process.env.E2E_WEB_PORT ?? "3100";
const nextBin = join(webDir, "node_modules/next/dist/bin/next");

if (process.env.E2E_REUSE_BUILD !== "1" || !existsSync(join(webDir, ".next/BUILD_ID"))) {
  const build = spawnSync(process.execPath, [nextBin, "build"], {
    cwd: webDir,
    stdio: "inherit",
    env: process.env,
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const child = spawn(process.execPath, [nextBin, "start", "--port", port], {
  cwd: webDir,
  stdio: "inherit",
  env: process.env,
});
const stop = () => child.kill();
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", (code) => process.exit(code ?? 0));
