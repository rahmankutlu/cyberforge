"""Loads and cross-validates repository content from disk.

Layout (relative to the content root):

    labs/<domain>/<slug>/{lab.yaml, README.md, telemetry/scenario.jsonl, ...}
    detections/sigma/**/*.yml      one Sigma document (or detection + correlation pair) per file
    detections/yara/*.yar          one YARA rule per file
    detections/suricata/*.rules    one Suricata rule per line
    datasets/<kind>/*.jsonl        synthetic background telemetry
    mitre/{attack,atlas}.json      built by scripts/build_mitre_data.py
    packages/security-content/     learning tracks, 30-day plan, indicators, analysts
    examples/incidents/*.yaml      synthetic incidents that back the seeded SOC data
    docs/*.md                      documentation (indexed by global search)
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, TypeVar

import yaml
from pydantic import BaseModel, ValidationError

from cyberforge.content.demos import DemoScenario
from cyberforge.content.schemas import (
    AnalystDoc,
    IncidentDoc,
    IndicatorDoc,
    LabDoc,
    LabTestsDoc,
    PlaygroundDataset,
    ScenarioEvent,
    ThirtyDaysDoc,
    TrackDoc,
)
from cyberforge.content.stories import StoryDoc
from cyberforge.services import sigma_service
from cyberforge.services.telemetry import known_category

T = TypeVar("T", bound=BaseModel)

LEVELS = {"critical", "high", "medium", "low", "informational"}


@dataclass
class ContentIssue:
    path: str
    message: str
    level: str = "error"  # error | warning

    def __str__(self) -> str:
        return f"[{self.level}] {self.path}: {self.message}"


@dataclass
class LoadedLab:
    doc: LabDoc
    scenario: list[ScenarioEvent]
    path: Path
    tests: LabTestsDoc | None = None  # tests/lab.tests.yml, when the lab ships one


@dataclass
class LoadedRule:
    slug: str
    format: str
    title: str
    level: str
    status: str
    description: str
    content: str
    logsource: dict[str, Any]
    tags: list[str]
    technique_ids: list[str]
    false_positives: list[str]
    references: list[str]
    author: str
    is_correlation: bool
    path: str
    tests_path: str | None = None  # Sigma only: the rule's tests file, relative to the root


@dataclass
class DocPage:
    slug: str
    title: str
    path: str
    markdown: str


@dataclass
class ContentBundle:
    root: Path
    labs: list[LoadedLab] = field(default_factory=list)
    rules: list[LoadedRule] = field(default_factory=list)
    mitre_tactics: list[dict[str, Any]] = field(default_factory=list)
    mitre_techniques: list[dict[str, Any]] = field(default_factory=list)
    mitre_versions: dict[str, str] = field(default_factory=dict)
    datasets: dict[str, list[ScenarioEvent]] = field(default_factory=dict)
    tracks: list[TrackDoc] = field(default_factory=list)
    thirty_days: ThirtyDaysDoc | None = None
    incidents: list[IncidentDoc] = field(default_factory=list)
    indicators: list[IndicatorDoc] = field(default_factory=list)
    analysts: list[AnalystDoc] = field(default_factory=list)
    docs: list[DocPage] = field(default_factory=list)
    ai_security: dict[str, Any] = field(default_factory=dict)
    stories: list[StoryDoc] = field(default_factory=list)
    demos: list[DemoScenario] = field(default_factory=list)
    playground_datasets: list[Any] = field(default_factory=list)  # PlaygroundDataset
    issues: list[ContentIssue] = field(default_factory=list)

    @property
    def errors(self) -> list[ContentIssue]:
        return [i for i in self.issues if i.level == "error"]

    def rule(self, slug: str) -> LoadedRule | None:
        return next((r for r in self.rules if r.slug == slug), None)

    def lab(self, slug: str) -> LoadedLab | None:
        return next((lab for lab in self.labs if lab.doc.slug == slug), None)


class ContentError(RuntimeError):
    def __init__(self, issues: list[ContentIssue]):
        self.issues = issues
        super().__init__("Invalid content:\n" + "\n".join(str(i) for i in issues[:25]))


def _rel(root: Path, path: Path) -> str:
    return path.relative_to(root).as_posix()


def _load_model(model: type[T], path: Path, root: Path, issues: list[ContentIssue]) -> T | None:
    try:
        data = yaml.safe_load(path.read_text(encoding="utf-8"))
        return model.model_validate(data)
    except ValidationError as exc:
        for err in exc.errors():
            loc = ".".join(str(p) for p in err["loc"])
            issues.append(ContentIssue(_rel(root, path), f"{loc}: {err['msg']}"))
    except (OSError, yaml.YAMLError) as exc:
        issues.append(ContentIssue(_rel(root, path), f"cannot read: {exc}"))
    return None


def _load_jsonl(path: Path, root: Path, issues: list[ContentIssue]) -> list[ScenarioEvent]:
    events: list[ScenarioEvent] = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            events.append(ScenarioEvent.model_validate(json.loads(line)))
        except (json.JSONDecodeError, ValidationError) as exc:
            issues.append(ContentIssue(f"{_rel(root, path)}:{lineno}", str(exc).splitlines()[0]))
    for i, ev in enumerate(events):
        if not known_category(ev.category):
            issues.append(
                ContentIssue(_rel(root, path), f"event {i}: unknown category {ev.category!r}")
            )
    return events


# --- labs -------------------------------------------------------------------------------------


def _load_labs(root: Path, issues: list[ContentIssue]) -> list[LoadedLab]:
    labs: list[LoadedLab] = []
    for lab_yaml in sorted((root / "labs").glob("*/*/lab.yaml")):
        lab_dir = lab_yaml.parent
        doc = _load_model(LabDoc, lab_yaml, root, issues)
        if doc is None:
            continue
        rel = _rel(root, lab_yaml)
        if doc.slug != lab_dir.name:
            issues.append(
                ContentIssue(rel, f"slug {doc.slug!r} must match directory {lab_dir.name!r}")
            )
        if doc.domain != lab_dir.parent.name:
            issues.append(
                ContentIssue(
                    rel, f"domain {doc.domain!r} must match parent {lab_dir.parent.name!r}"
                )
            )
        if not (lab_dir / "README.md").is_file():
            issues.append(ContentIssue(rel, "missing README.md (run `pnpm content:labs`)"))
        scenario_path = lab_dir / doc.telemetry.scenario_file
        scenario: list[ScenarioEvent] = []
        if scenario_path.is_file():
            scenario = _load_jsonl(scenario_path, root, issues)
        else:
            issues.append(
                ContentIssue(rel, f"scenario file {doc.telemetry.scenario_file} not found")
            )
        tests = None
        tests_file = lab_dir / "tests" / "lab.tests.yml"
        if tests_file.is_file():
            tests = _load_model(LabTestsDoc, tests_file, root, issues)
        labs.append(LoadedLab(doc=doc, scenario=scenario, path=lab_dir, tests=tests))
    return labs


# --- detection rules --------------------------------------------------------------------------


def is_tests_file(path: Path) -> bool:
    """Rule tests live beside the rule: `<slug>.tests.yml`, or `tests.yml` next to `rule.yml`."""
    return path.name == "tests.yml" or path.name.endswith(".tests.yml")


def sigma_slug(path: Path) -> str:
    """`<slug>.yml`, or `<slug>/rule.yml` (the directory layout used by examples)."""
    return path.parent.name if path.name == "rule.yml" else path.stem


def sigma_tests_path(path: Path) -> Path:
    if path.name == "rule.yml":
        return path.parent / "tests.yml"
    return path.with_name(f"{path.stem}.tests.yml")


def _load_sigma(root: Path, issues: list[ContentIssue]) -> list[LoadedRule]:
    rules: list[LoadedRule] = []
    # Shared rules live in detections/sigma; a lab may also ship its own in labs/<domain>/<lab>/detections.
    paths = [*(root / "detections" / "sigma").rglob("*.yml"), *root.glob("labs/*/*/detections/**/*.yml")]
    for path in sorted(paths):
        if is_tests_file(path):
            continue
        text = path.read_text(encoding="utf-8")
        rel = _rel(root, path)
        tests = sigma_tests_path(path)
        report = sigma_service.validate(text)
        for err in report.errors:
            issues.append(ContentIssue(rel, err))
        if report.meta is None:
            continue
        meta = report.meta
        if meta.level not in LEVELS:
            issues.append(ContentIssue(rel, f"invalid level {meta.level!r}"))
        for warning in report.warnings:
            issues.append(ContentIssue(rel, warning, level="warning"))
        rules.append(
            LoadedRule(
                slug=sigma_slug(path),
                format="sigma",
                title=meta.title,
                level=meta.level,
                status=meta.status or "experimental",
                description=meta.description,
                content=text,
                logsource=meta.logsource,
                tags=meta.tags,
                technique_ids=meta.techniques,
                false_positives=meta.falsepositives,
                references=meta.references,
                author=meta.author or "CyberForge",
                is_correlation=meta.is_correlation,
                path=rel,
                tests_path=_rel(root, tests) if tests.is_file() else None,
            )
        )
    return rules


def _load_yara(root: Path, issues: list[ContentIssue]) -> list[LoadedRule]:
    import plyara

    rules: list[LoadedRule] = []
    for path in sorted((root / "detections" / "yara").glob("*.yar")):
        text = path.read_text(encoding="utf-8")
        rel = _rel(root, path)
        try:
            parsed = plyara.Plyara().parse_string(text)
        except Exception as exc:
            issues.append(ContentIssue(rel, f"YARA syntax error: {exc}"))
            continue
        for rule in parsed:
            meta: dict[str, Any] = {}
            for item in rule.get("metadata", []):
                meta.update(item)
            technique = meta.get("mitre_attack")
            rules.append(
                LoadedRule(
                    slug=f"yara-{rule['rule_name'].lower().replace('_', '-')}",
                    format="yara",
                    title=str(meta.get("title", rule["rule_name"])),
                    level=str(meta.get("severity", "medium")),
                    status=str(meta.get("status", "experimental")),
                    description=str(meta.get("description", "")),
                    content=text,
                    logsource={"kind": "file"},
                    tags=list(rule.get("tags", [])),
                    technique_ids=[technique] if technique else [],
                    false_positives=[str(meta["false_positives"])]
                    if meta.get("false_positives")
                    else [],
                    references=[str(meta["reference"])] if meta.get("reference") else [],
                    author=str(meta.get("author", "CyberForge")),
                    is_correlation=False,
                    path=rel,
                )
            )
    return rules


_SURICATA = re.compile(r"^(alert|drop|pass|reject)\s+(\S+)\s+(.+?)\s+->\s+(.+?)\s+\((.*)\)\s*$")


def _load_suricata(root: Path, issues: list[ContentIssue]) -> list[LoadedRule]:
    rules: list[LoadedRule] = []
    for path in sorted((root / "detections" / "suricata").glob("*.rules")):
        rel = _rel(root, path)
        for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            match = _SURICATA.match(line.strip())
            if not match:
                issues.append(ContentIssue(f"{rel}:{lineno}", "not a valid Suricata rule header"))
                continue
            options = _suricata_options(match.group(5))
            sid = options.get("sid")
            msg = options.get("msg", "").strip('"')
            if not sid or not msg:
                issues.append(ContentIssue(f"{rel}:{lineno}", "rule needs both msg and sid"))
                continue
            meta = options.get("metadata", "")
            technique = re.search(r"mitre_technique_id\s+(T\d{4}(?:\.\d{3})?)", meta)
            severity = re.search(r"severity\s+(\w+)", meta)
            rules.append(
                LoadedRule(
                    slug=f"suricata-{sid}",
                    format="suricata",
                    title=msg,
                    level=severity.group(1).lower() if severity else "medium",
                    status="experimental",
                    description=f"Suricata {match.group(1)} rule ({match.group(2)}): {msg}",
                    content=line.strip(),
                    logsource={"kind": "network", "protocol": match.group(2)},
                    tags=[options["classtype"]] if "classtype" in options else [],
                    technique_ids=[technique.group(1)] if technique else [],
                    false_positives=[],
                    references=[],
                    author="CyberForge",
                    is_correlation=False,
                    path=f"{rel}:{lineno}",
                )
            )
    return rules


def _suricata_options(body: str) -> dict[str, str]:
    """Split `key:value; key2:value2;` respecting quoted strings (first occurrence wins)."""
    options: dict[str, str] = {}
    for token in re.findall(r'(?:[^;"\\]|\\.|"(?:[^"\\]|\\.)*")+', body):
        key, _, value = token.strip().partition(":")
        options.setdefault(key.strip(), value.strip())
    return options


# --- everything else --------------------------------------------------------------------------


def _load_mitre(root: Path, bundle: ContentBundle) -> None:
    for name in ("attack", "atlas"):
        path = root / "mitre" / f"{name}.json"
        if not path.is_file():
            bundle.issues.append(
                ContentIssue(f"mitre/{name}.json", "missing (run `pnpm content:mitre`)")
            )
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        bundle.mitre_versions[name] = str(data.get("version", ""))
        bundle.mitre_tactics.extend(data["tactics"])
        bundle.mitre_techniques.extend(data["techniques"])


def _load_datasets(root: Path, bundle: ContentBundle) -> None:
    for path in sorted((root / "datasets").glob("*/*.jsonl")):
        bundle.datasets[f"{path.parent.name}/{path.stem}"] = _load_jsonl(path, root, bundle.issues)


def _load_playground_datasets(root: Path, bundle: ContentBundle) -> None:
    for path in sorted((root / "datasets" / "playground").glob("*.yaml")):
        dataset = _load_model(PlaygroundDataset, path, root, bundle.issues)
        if dataset is None:
            continue
        rel = _rel(root, path)
        if dataset.slug != path.stem:
            bundle.issues.append(ContentIssue(rel, f"slug {dataset.slug!r} must match the file name"))
        for i, ev in enumerate(dataset.events):
            if not known_category(ev.category):
                bundle.issues.append(ContentIssue(rel, f"event {i}: unknown category {ev.category!r}"))
        bundle.playground_datasets.append(dataset)


def _load_stories(root: Path, bundle: ContentBundle) -> None:
    for path in sorted((root / "stories").glob("*.yaml")):
        story = _load_model(StoryDoc, path, root, bundle.issues)
        if story is None:
            continue
        if story.slug != path.stem:
            bundle.issues.append(
                ContentIssue(_rel(root, path), f"slug {story.slug!r} must match the file name")
            )
        bundle.stories.append(story)


def _load_demos(root: Path, bundle: ContentBundle) -> None:
    for path in sorted((root / "demos").glob("*.yaml")):
        demo = _load_model(DemoScenario, path, root, bundle.issues)
        if demo is None:
            continue
        if demo.slug != path.stem:
            bundle.issues.append(
                ContentIssue(_rel(root, path), f"slug {demo.slug!r} must match the file name")
            )
        for i, ev in enumerate(demo.events):
            if not known_category(ev.category):
                bundle.issues.append(
                    ContentIssue(_rel(root, path), f"event {i}: unknown category {ev.category!r}")
                )
        bundle.demos.append(demo)


def _load_yaml_list(path: Path, model: type[T], root: Path, issues: list[ContentIssue]) -> list[T]:
    if not path.is_file():
        return []
    out: list[T] = []
    try:
        rows = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    except yaml.YAMLError as exc:
        issues.append(ContentIssue(_rel(root, path), str(exc)))
        return out
    for i, row in enumerate(rows):
        try:
            out.append(model.model_validate(row))
        except ValidationError as exc:
            issues.append(ContentIssue(f"{_rel(root, path)}[{i}]", str(exc.errors()[0]["msg"])))
    return out


def _load_docs(root: Path) -> list[DocPage]:
    pages: list[DocPage] = []
    candidates = sorted((root / "docs").glob("*.md")) + [
        root / n
        for n in ("ARCHITECTURE.md", "ROADMAP.md", "CONTRIBUTING.md", "SECURITY.md")
        if (root / n).is_file()
    ]
    for path in candidates:
        text = path.read_text(encoding="utf-8")
        heading = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        pages.append(
            DocPage(
                slug=path.stem.lower(),
                title=heading.group(1).strip() if heading else path.stem,
                path=_rel(root, path),
                markdown=text,
            )
        )
    return pages


def load_bundle(root: Path) -> ContentBundle:
    root = root.resolve()
    bundle = ContentBundle(root=root)
    bundle.labs = _load_labs(root, bundle.issues)
    bundle.rules = (
        _load_sigma(root, bundle.issues)
        + _load_yara(root, bundle.issues)
        + _load_suricata(root, bundle.issues)
    )
    _load_mitre(root, bundle)
    _load_datasets(root, bundle)
    _load_playground_datasets(root, bundle)
    _load_stories(root, bundle)
    _load_demos(root, bundle)

    content_pkg = root / "packages" / "security-content"
    for path in sorted((content_pkg / "learning" / "tracks").glob("*.yaml")):
        track = _load_model(TrackDoc, path, root, bundle.issues)
        if track:
            bundle.tracks.append(track)
    thirty = content_pkg / "learning" / "30-days.yaml"
    if thirty.is_file():
        bundle.thirty_days = _load_model(ThirtyDaysDoc, thirty, root, bundle.issues)
    bundle.indicators = _load_yaml_list(
        content_pkg / "threat-intel" / "indicators.yaml", IndicatorDoc, root, bundle.issues
    )
    bundle.analysts = _load_yaml_list(
        content_pkg / "analysts.yaml", AnalystDoc, root, bundle.issues
    )
    for path in sorted((root / "examples" / "incidents").glob("*.yaml")):
        incident = _load_model(IncidentDoc, path, root, bundle.issues)
        if incident:
            bundle.incidents.append(incident)
    ai_path = content_pkg / "ai-security" / "trust-boundaries.yaml"
    if ai_path.is_file():
        try:
            bundle.ai_security = yaml.safe_load(ai_path.read_text(encoding="utf-8")) or {}
        except yaml.YAMLError as exc:
            bundle.issues.append(ContentIssue(_rel(root, ai_path), str(exc)))
    bundle.docs = _load_docs(root)
    cross_validate(bundle)
    return bundle


def cross_validate(bundle: ContentBundle) -> None:
    """Referential integrity across content types."""
    issues = bundle.issues
    technique_ids = {t["id"] for t in bundle.mitre_techniques}
    rule_slugs: set[str] = set()
    for rule in bundle.rules:
        if rule.slug in rule_slugs:
            issues.append(ContentIssue(rule.path, f"duplicate rule slug {rule.slug!r}"))
        rule_slugs.add(rule.slug)
        for tid in rule.technique_ids:
            if tid not in technique_ids:
                issues.append(ContentIssue(rule.path, f"unknown MITRE identifier {tid}"))

    slugs_seen: set[str] = set()
    for ds in bundle.playground_datasets:
        where = f"datasets/playground/{ds.slug}.yaml"
        if ds.slug in slugs_seen:
            issues.append(ContentIssue(where, "duplicate dataset slug"))
        slugs_seen.add(ds.slug)
        for slug in ds.expected_rules:
            if slug not in rule_slugs:
                issues.append(ContentIssue(where, f"unknown expected rule {slug!r}"))
        for tid in ds.mitre:
            if tid not in technique_ids:
                issues.append(ContentIssue(where, f"unknown MITRE identifier {tid}"))

    lab_slugs: set[str] = set()
    numbers: set[int] = set()
    for lab in bundle.labs:
        doc, rel = lab.doc, f"labs/{lab.doc.domain}/{lab.doc.slug}"
        if doc.slug in lab_slugs:
            issues.append(ContentIssue(rel, "duplicate lab slug"))
        if doc.number in numbers:
            issues.append(ContentIssue(rel, f"duplicate lab number {doc.number}"))
        lab_slugs.add(doc.slug)
        numbers.add(doc.number)
        for tid in doc.mitre:
            if tid not in technique_ids:
                issues.append(ContentIssue(f"{rel}/lab.yaml", f"unknown MITRE identifier {tid}"))
        for slug in doc.expected_detection.rules:
            if slug not in rule_slugs:
                issues.append(ContentIssue(f"{rel}/lab.yaml", f"unknown detection rule {slug!r}"))

    for inc in bundle.incidents:
        if inc.lab not in lab_slugs:
            issues.append(
                ContentIssue(f"examples/incidents/{inc.slug}.yaml", f"unknown lab {inc.lab!r}")
            )
    analyst_handles = {a.handle for a in bundle.analysts}
    for inc in bundle.incidents:
        for who in [inc.lead, *[n.analyst for n in inc.notes]]:
            if who not in analyst_handles:
                issues.append(
                    ContentIssue(f"examples/incidents/{inc.slug}.yaml", f"unknown analyst {who!r}")
                )

    modules = [(t.slug, m) for t in bundle.tracks for m in t.modules]
    days = bundle.thirty_days.days if bundle.thirty_days else []
    for where, labs, rules, techniques in [
        *[(f"track {t}/{m.slug}", m.labs, m.rules, m.techniques) for t, m in modules],
        *[(f"30-days day {d.day}", d.labs, d.rules, d.techniques) for d in days],
    ]:
        for s in labs:
            if s not in lab_slugs:
                issues.append(ContentIssue(where, f"unknown lab {s!r}"))
        for s in rules:
            if s not in rule_slugs:
                issues.append(ContentIssue(where, f"unknown rule {s!r}"))
        for s in techniques:
            if s not in technique_ids:
                issues.append(ContentIssue(where, f"unknown MITRE identifier {s}"))
    for boundary in bundle.ai_security.get("boundaries", []):
        for slug in boundary.get("rules", []):
            if slug not in rule_slugs:
                issues.append(
                    ContentIssue("ai-security/trust-boundaries.yaml", f"unknown rule {slug!r}")
                )
    for topic in bundle.ai_security.get("topics", []):
        for slug in topic.get("labs", []):
            if slug not in lab_slugs:
                issues.append(
                    ContentIssue("ai-security/trust-boundaries.yaml", f"unknown lab {slug!r}")
                )
        for tid in topic.get("atlas", []):
            if tid not in technique_ids:
                issues.append(
                    ContentIssue(
                        "ai-security/trust-boundaries.yaml", f"unknown ATLAS identifier {tid}"
                    )
                )
    module_slugs = [m.slug for _, m in modules]
    for dup in {s for s in module_slugs if module_slugs.count(s) > 1}:
        issues.append(ContentIssue("learning", f"duplicate module slug {dup!r}"))
    if days and sorted(d.day for d in days) != list(range(1, 31)):
        issues.append(ContentIssue("30-days.yaml", "days must be numbered 1..30 exactly once"))
