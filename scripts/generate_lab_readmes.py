#!/usr/bin/env python3
"""Render labs/<domain>/<slug>/README.md from each lab.yaml.

lab.yaml is the source of truth; the README exists so a lab reads well on GitHub. Run this after
editing a lab (`pnpm content:labs`). The validator fails if a README is missing.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))

import yaml
from cyberforge.content.lab_readme import render
from cyberforge.content.schemas import LabDoc


def main() -> None:
    count = 0
    for lab_yaml in sorted((ROOT / "labs").glob("*/*/lab.yaml")):
        lab = LabDoc.model_validate(
            yaml.safe_load(lab_yaml.read_text(encoding="utf-8"))
        )
        has_scenario = (lab_yaml.parent / lab.telemetry.scenario_file).is_file()
        readme = lab_yaml.parent / "README.md"
        readme.write_text(render(lab, has_scenario), encoding="utf-8", newline="\n")
        count += 1
    print(f"generated {count} lab README files")


if __name__ == "__main__":
    main()
