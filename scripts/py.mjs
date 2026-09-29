#!/usr/bin/env node
// Runs a Python command with the repo interpreter: `node scripts/py.mjs -m pytest`.
import { spawnSync } from "node:child_process";
import { findPython, root } from "./lib/python.mjs";

const result = spawnSync(findPython(), process.argv.slice(2), {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PYTHONUTF8: "1" },
});
process.exit(result.status ?? 1);
