#!/usr/bin/env node
// Starts the FastAPI service for local development without Docker.
// Uses SQLite unless DATABASE_URL is set, so `pnpm dev:api` works on a bare checkout.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { findPython, root } from "./lib/python.mjs";

const port = process.env.API_PORT ?? "8000";
mkdirSync(join(root, ".data"), { recursive: true });

const env = {
  CYBERFORGE_ENV: "development",
  CYBERFORGE_SEED_ON_START: "true",
  CYBERFORGE_DEMO_MODE: "true",
  // The web app proxies /api/v1, so trust its forwarded host for same-origin checks.
  CYBERFORGE_TRUST_PROXY: "true",
  DATABASE_URL: `sqlite:///${join(root, ".data", "cyberforge.sqlite").replace(/\\/g, "/")}`,
  ...process.env,
  PYTHONUTF8: "1",
};

const reload = process.env.API_RELOAD === "false" ? [] : ["--reload"];
const child = spawn(
  findPython(),
  ["-m", "uvicorn", "cyberforge.main:app", "--host", "127.0.0.1", "--port", port, ...reload],
  { cwd: join(root, "apps/api"), stdio: "inherit", env },
);
child.on("exit", (code) => process.exit(code ?? 0));
