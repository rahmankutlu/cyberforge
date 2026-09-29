// Starts the FastAPI service for E2E tests against a fresh, throw-away SQLite database.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const dataDir = join(root, ".data");
mkdirSync(dataDir, { recursive: true });
const db = join(dataDir, "e2e.sqlite");
for (const suffix of ["", "-wal", "-shm"]) rmSync(db + suffix, { force: true });

const child = spawn(process.execPath, [join(root, "scripts/dev-api.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    API_PORT: process.env.E2E_API_PORT ?? "8100",
    API_RELOAD: "false",
    DATABASE_URL: `sqlite:///${db.replace(/\\/g, "/")}`,
    CYBERFORGE_DEMO_MODE: "true",
    CYBERFORGE_AI_PROVIDER: "none",
    CYBERFORGE_RATE_LIMIT_PER_MINUTE: "100000",
    CYBERFORGE_EXPENSIVE_RATE_LIMIT_PER_MINUTE: "100000",
  },
});
const stop = () => child.kill();
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
child.on("exit", (code) => process.exit(code ?? 0));
