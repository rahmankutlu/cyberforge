"""Fail when the version is not the same everywhere it is written down.

    pnpm versions:check                 # every file agrees
    pnpm versions:check --tag v1.0.0    # ...and matches a release tag (used by the release workflow)

A release bumps the packages, the API, CITATION.cff and the changelog together. Doing it by hand
is how a published image ends up reporting the wrong version.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

import tomllib

ROOT = Path(__file__).resolve().parents[1]
SEMVER = re.compile(r"^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$")


def versions() -> dict[str, str]:
    found: dict[str, str] = {}
    for manifest in (
        "package.json",
        "apps/web/package.json",
        *sorted(
            str(p.relative_to(ROOT)).replace("\\", "/")
            for p in (ROOT / "packages").glob("*/package.json")
        ),
    ):
        found[manifest] = json.loads((ROOT / manifest).read_text(encoding="utf-8"))["version"]

    pyproject = tomllib.loads((ROOT / "apps/api/pyproject.toml").read_text(encoding="utf-8"))
    found["apps/api/pyproject.toml"] = pyproject["project"]["version"]

    init = (ROOT / "apps/api/cyberforge/__init__.py").read_text(encoding="utf-8")
    match = re.search(r'^__version__ = "([^"]+)"', init, re.MULTILINE)
    found["apps/api/cyberforge/__init__.py"] = match.group(1) if match else "missing"

    citation = (ROOT / "CITATION.cff").read_text(encoding="utf-8")
    match = re.search(r"^version: (\S+)", citation, re.MULTILINE)
    found["CITATION.cff"] = match.group(1) if match else "missing"

    changelog = (ROOT / "CHANGELOG.md").read_text(encoding="utf-8")
    match = re.search(r"^## \[(\d[^\]]*)\]", changelog, re.MULTILINE)
    found["CHANGELOG.md (latest release)"] = match.group(1) if match else "missing"
    return found


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tag", help="a release tag such as v1.0.0 that must match")
    args = parser.parse_args(argv)

    found = versions()
    expected = found["package.json"]
    problems = [f"{where}: {value}" for where, value in found.items() if value != expected]
    if not SEMVER.match(expected):
        problems.append(f"package.json: {expected!r} is not a semantic version")
    if args.tag and args.tag.removeprefix("v") != expected:
        problems.append(f"tag {args.tag} does not match version {expected}")

    if problems:
        print(f"Version mismatch (expected {expected}):", file=sys.stderr)
        for problem in problems:
            print(f"  {problem}", file=sys.stderr)
        return 1
    print(f"All {len(found)} version declarations are {expected}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
