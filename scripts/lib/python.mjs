// Locates the Python interpreter used by repo tooling.
// Prefers apps/api/.venv, then $PYTHON, then python3/python on PATH.
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function findPython() {
  const venv = [
    join(root, "apps/api/.venv/Scripts/python.exe"),
    join(root, "apps/api/.venv/bin/python"),
  ].find(existsSync);
  if (venv) return venv;
  if (process.env.PYTHON) return process.env.PYTHON;
  return process.platform === "win32" ? "python" : "python3";
}
