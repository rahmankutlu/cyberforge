"""Keep the Turkish content catalogue in step with the English YAML sources.

The English YAML files stay canonical. The catalogue (``apps/web/src/lib/i18n/tr-content.json``) maps
each authored English string to a *human-reviewed* Turkish translation. This tool never translates:
it finds strings that still need a translator and refuses translations that damage code, links,
identifiers or Markdown structure.

    node scripts/py.mjs scripts/i18n_catalog.py check   # CI gate, exits 1 on any problem
    node scripts/py.mjs scripts/i18n_catalog.py sync    # add empty entries, drop stale ones

Translators work from ``docs/localization.md`` and the terminology in
``apps/web/src/lib/i18n/glossary.tr.json``.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import yaml

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / "apps/web/src/lib/i18n/tr-content.json"

# Strings the API derives at runtime (title-cased rule names, fixed audience labels) rather than
# reading verbatim from a YAML field. They are translated like any other entry.
API_DERIVED = frozenset(
    {
        "CF LAB Canary Token In Outbound HTTP Body",
        "CF LAB DNS Query With Long Encoded Label",
        "CF LAB Known Scanner User-Agent sqlmap",
        "CF LAB Possible TCP SYN Scan - many probes from one source",
        "CF LAB Request For Exposed Environment File",
        "CyberForge Lab Canary Token Present In File",
        "EICAR Anti-Malware Test File",
        "Everyone",
        "OLE Document With Auto-Execute Macro And Shell Object",
        "PHP Script Evaluating Request Input",
        "PowerShell Script With Download-And-Execute Cradle",
    }
)

# Tokens a translation must reproduce exactly: code, links and machine-readable identifiers.
PROTECTED = (
    re.compile(r"`[^`\n]+`"),
    re.compile(r"https?://[^\s)]+"),
    re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
    re.compile(r"\bT\d{4}(?:\.\d{3})?\b"),
    re.compile(r"\{\{\w+\}\}"),
)
STRUCTURE = (
    ("heading", re.compile(r"(?m)^#{1,6} ")),
    ("list item", re.compile(r"(?m)^- ")),
    ("bold span", re.compile(r"\*\*[^*\n]+\*\*")),
)


def _strings(items: Iterable[dict[str, Any]], *keys: str) -> Iterable[str]:
    for item in items:
        for key in keys:
            value = item.get(key)
            if isinstance(value, str) and value.strip():
                yield value


def _load(path: Path) -> Any:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def extract_labs() -> list[str]:
    result: list[str] = []
    for path in sorted((ROOT / "labs").glob("**/lab.yaml")):
        data = _load(path)
        result.extend(_strings([data], "title", "summary", "scenario"))
        result.extend(data.get("objectives", []))
        architecture = data.get("architecture", {})
        result.extend(_strings([architecture], "description"))
        result.extend(_strings(architecture.get("components", []), "role"))
        result.extend(data.get("setup", {}).get("steps", []))
        result.extend(_strings(data.get("telemetry", {}).get("sources", []), "name", "description"))
        simulation = data.get("attack_simulation", {})
        result.extend(_strings([simulation], "description"))
        result.extend(_strings(simulation.get("steps", []), "title", "detail"))
        result.extend(_strings([data.get("expected_detection", {})], "description"))
        result.extend(
            _strings(data.get("investigation_questions", []), "question", "hint", "answer")
        )
        result.extend(data.get("mitigation", []))
        result.extend(data.get("cleanup", []))
        result.extend(_strings(data.get("references", []), "title"))
    return result


def extract_stories() -> list[str]:
    result: list[str] = []
    for path in sorted((ROOT / "stories").glob("*.yaml")):
        data = _load(path)
        result.extend(_strings([data], "title", "summary", "briefing"))
        result.extend(_strings(data.get("attack_chain", []), "tactic", "description"))
        for step in data.get("steps", []):
            result.extend(_strings([step], "title", "narrative"))
            result.extend(_strings(step.get("telemetry", []), "note"))
            for evidence in step.get("evidence", []):
                result.extend(_strings([evidence], "title", "finding"))
                if evidence.get("kind") in {"note", "ticket", "email"}:
                    result.extend(_strings([evidence], "content"))
            if step.get("alert"):
                result.extend(_strings([step["alert"]], "title"))
            for question in step.get("questions", []):
                result.extend(_strings([question], "prompt", "hint"))
                result.extend(_strings(question.get("options", []), "text", "explanation"))
            decision = step.get("decision")
            if decision:
                result.extend(_strings([decision], "prompt", "context"))
                result.extend(_strings(decision.get("options", []), "text", "feedback"))
            for node in step.get("graph_nodes", []):
                if node.get("type") in {"detection", "alert", "technique"}:
                    result.extend(_strings([node], "label"))
            result.extend(_strings(step.get("graph_edges", []), "relation"))
        result.extend(_strings(data.get("containment", []), "action", "effect", "feedback"))
        postmortem = data.get("postmortem", {})
        result.extend(_strings([postmortem], "summary", "root_cause"))
        for key in ("what_worked", "what_to_improve", "detections_to_add", "lessons"):
            result.extend(postmortem.get(key, []))
    return result


def extract_learning() -> list[str]:
    result: list[str] = []
    for path in sorted((ROOT / "packages/security-content/learning").glob("**/*.yaml")):
        data = _load(path)
        result.extend(_strings([data], "title", "audience", "summary"))
        result.extend(_strings(data.get("modules", []), "title", "summary", "body"))
        for day in data.get("days", []):
            result.extend(_strings([day], "title", "summary"))
            result.extend(day.get("tasks", []))
            result.extend(_strings(day.get("reading", []), "title"))
            # The web app renders each day as Markdown assembled from these fields.
            body = (
                "## Today\n\n"
                + day["summary"]
                + "\n\n### Tasks\n\n"
                + "\n".join(f"- {task}" for task in day.get("tasks", []))
            )
            if day.get("reading"):
                body += "\n\n### Reading\n\n" + "\n".join(
                    f"- [{item['title']}]({item['url']})" for item in day["reading"]
                )
            result.append(body)
    return result


def extract_detections() -> list[str]:
    result: list[str] = []
    for path in sorted((ROOT / "detections").glob("**/*.yml")):
        if path.name.endswith(".tests.yml"):
            continue
        for data in yaml.safe_load_all(path.read_text(encoding="utf-8")):
            if isinstance(data, dict):
                result.extend(_strings([data], "title", "description"))
                result.extend(data.get("falsepositives", []))
    return result


def extract_ai_security() -> list[str]:
    path = ROOT / "packages/security-content/ai-security/trust-boundaries.yaml"
    data = _load(path)
    result = list(_strings(data.get("nodes", []), "label", "description"))
    for boundary in data.get("boundaries", []):
        result.extend(_strings([boundary], "title", "description"))
        result.extend(boundary.get("failure_modes", []))
        result.extend(boundary.get("controls", []))
    result.extend(_strings(data.get("topics", []), "title", "summary"))
    return result


def extract_threat_intel() -> list[str]:
    data = _load(ROOT / "packages/security-content/threat-intel/indicators.yaml")
    return list(_strings(data, "notes"))


def extract_incidents() -> list[str]:
    result: list[str] = []
    for path in sorted((ROOT / "examples/incidents").glob("*.yaml")):
        data = _load(path)
        result.extend(_strings([data], "title", "summary"))
        result.extend(_strings(data.get("notes", []), "body"))
        result.extend(_strings(data.get("timeline", []), "title", "detail"))
        if data.get("report"):
            result.extend(
                _strings(
                    [data["report"]],
                    "executive_summary",
                    "evidence",
                    "root_cause",
                    "containment",
                    "remediation",
                    "lessons_learned",
                )
            )
    return result


def extract_sources() -> set[str]:
    """Every authored string the web app can show, exactly as the API returns it."""
    found = (
        extract_labs()
        + extract_stories()
        + extract_learning()
        + extract_detections()
        + extract_ai_security()
        + extract_threat_intel()
        + extract_incidents()
    )
    return {value for value in found if isinstance(value, str) and value.strip()}


def _tokens(text: str) -> list[str]:
    return sorted(token for pattern in PROTECTED for token in pattern.findall(text))


def audit(source: str, translation: str) -> list[str]:
    """Return the ways a translation disagrees with its English source."""
    problems: list[str] = []
    if not translation.strip():
        return ["untranslated"]
    if _tokens(source) != _tokens(translation):
        problems.append("code, link, address or placeholder tokens differ from the source")
    for name, pattern in STRUCTURE:
        if len(pattern.findall(source)) != len(pattern.findall(translation)):
            problems.append(f"{name} count differs from the source")
    return problems


def load_catalogue(path: Path) -> dict[str, str]:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def write_catalogue(path: Path, catalogue: dict[str, str]) -> None:
    path.write_text(
        json.dumps(dict(sorted(catalogue.items())), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _label(text: str) -> str:
    return repr(text.strip().replace("\n", " ")[:80])


def check(path: Path) -> int:
    sources = extract_sources()
    catalogue = load_catalogue(path)
    missing = sorted(sources - catalogue.keys())
    stale = sorted(catalogue.keys() - sources - API_DERIVED)
    damaged = {
        source: found
        for source, translation in catalogue.items()
        if source in sources | API_DERIVED and (found := audit(source, translation))
    }

    for source in missing:
        print(f"missing   {_label(source)}")
    for source in stale:
        print(f"stale     {_label(source)}")
    for source, found in damaged.items():
        print(f"invalid   {_label(source)}: {'; '.join(found)}")

    total = len(missing) + len(stale) + len(damaged)
    print(f"{len(catalogue)} entries checked, {total} problem(s).")
    if total:
        print("Run `pnpm i18n:sync`, then translate the empty entries by hand.")
    return 1 if total else 0


def sync(path: Path) -> int:
    sources = extract_sources()
    catalogue = load_catalogue(path)
    added = sorted(sources - catalogue.keys())
    dropped = sorted(catalogue.keys() - sources - API_DERIVED)
    for source in added:
        catalogue[source] = ""
    for source in dropped:
        del catalogue[source]
    write_catalogue(path, catalogue)
    print(f"Added {len(added)} empty entries, removed {len(dropped)} stale entries.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=("check", "sync"))
    parser.add_argument("--catalogue", type=Path, default=CATALOGUE)
    args = parser.parse_args(argv)
    return check(args.catalogue) if args.command == "check" else sync(args.catalogue)


if __name__ == "__main__":
    sys.exit(main())
