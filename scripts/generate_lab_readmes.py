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
from cyberforge.content.schemas import LabDoc

GENERATED = "<!-- Generated from lab.yaml by `pnpm content:labs`. Edit lab.yaml, not this file. -->"


def bullets(items: list[str]) -> str:
    return "\n".join(f"- {i}" for i in items)


def render(lab: LabDoc, has_scenario: bool) -> str:
    out = [GENERATED, "", f"# Lab {lab.number:02d} - {lab.title}", ""]
    out += [
        (
            f"**{lab.difficulty.title()}** · {lab.duration_minutes} min · {lab.category} · "
            f"`{lab.domain}` · MITRE: {', '.join(f'`{t}`' for t in lab.mitre)}"
        ),
        "",
        lab.summary,
        "",
        "## Objectives",
        bullets(lab.objectives),
        "",
        "## Scenario",
        lab.scenario.strip(),
        "",
        "## Architecture",
        lab.architecture.description.strip(),
        "",
    ]
    if lab.architecture.diagram:
        out += ["```mermaid", lab.architecture.diagram.rstrip(), "```", ""]
    out += ["| Component | Role | Network |", "| --- | --- | --- |"]
    out += [
        f"| {c.name} | {c.role} | `{c.network}` |" for c in lab.architecture.components
    ]
    out += ["", "## Lab setup", ""]
    out += [f"{i}. {s}" for i, s in enumerate(lab.setup.steps, start=1)]
    out += ["", "## Telemetry", ""]
    out += [
        f"- **{s.name}** (`{s.log_source}`): {s.description}"
        for s in lab.telemetry.sources
    ]
    if has_scenario:
        out += [
            "",
            f"The simulated events live in [`{lab.telemetry.scenario_file}`]({lab.telemetry.scenario_file}).",
        ]
    out += [
        "",
        "## Attack simulation",
        "",
        lab.attack_simulation.description.strip(),
        "",
    ]
    out += [
        f"{i}. **{s.title}** - {s.detail}"
        for i, s in enumerate(lab.attack_simulation.steps, start=1)
    ]
    out += [
        "",
        "## Expected detection",
        "",
        lab.expected_detection.description.strip(),
        "",
    ]
    out += [f"- `{slug}`" for slug in lab.expected_detection.rules]
    out += ["", "## Investigation questions", ""]
    for i, q in enumerate(lab.investigation_questions, start=1):
        out += [f"{i}. {q.question}", "   <details><summary>Hint and answer</summary>", "",
                f"   *Hint:* {q.hint}", "", f"   *Answer:* {q.answer}", "", "   </details>"]  # fmt: skip
    out += [
        "",
        "## Mitigation",
        bullets(lab.mitigation),
        "",
        "## Cleanup",
        bullets(lab.cleanup),
        "",
    ]
    out += ["## References", ""]
    out += [f"- [{r.title}]({r.url})" for r in lab.references]
    out += ["", "## Safety", ""]
    out += [
        (
            f"Scope: `{lab.safety.scope}` · Network: `{lab.safety.network}`. "
            "This lab only ever targets isolated CyberForge lab systems or synthetic data. "
            "See the [security model](../../../docs/security-model.md)."
        ),
        "",
    ]
    return "\n".join(out)


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
