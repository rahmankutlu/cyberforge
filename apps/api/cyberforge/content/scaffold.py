"""Community lab SDK: scaffold a new lab, then validate it.

    python -m cyberforge lab create web broken-authentication
    pnpm create:lab web broken-authentication

creates `labs/<domain>/<slug>/` with everything a lab needs and nothing it does not:

    lab.yaml                      the manifest (source of truth, validated strictly)
    README.md                     rendered from lab.yaml
    telemetry/scenario.jsonl      synthetic events the lab replays
    detections/<slug>-example.yml a lab-local Sigma rule ...
    detections/<slug>-example.tests.yml  ... with its positive and negative tests
    tests/lab.tests.yml           what the scenario must and must not trigger
    docker-compose.yml            only with --compose; isolated, localhost-only

The scaffold is a *working* lab: it validates the moment it is written, and every placeholder is
marked `TODO-REPLACE-ME` so it is impossible to ship one by accident (`pnpm validate:content`
warns on the marker). Contributors replace the placeholders; they never start from a blank page.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, get_args

import yaml

from cyberforge.content.lab_readme import render
from cyberforge.content.loader import ContentIssue, load_bundle
from cyberforge.content.schemas import SLUG_RE, Difficulty, Domain, LabDoc

MARKER = "TODO-REPLACE-ME"
DOMAINS: tuple[str, ...] = get_args(Domain)
DIFFICULTIES: tuple[str, ...] = get_args(Difficulty)
# Same namespace as scripts/assign_rule_ids.py so ids are reproducible everywhere.
RULE_ID_NAMESPACE = uuid.UUID("6f0f6a0e-5b7a-4a54-9d3e-8c1c2f9d7a11")
SCHEMA_URL = "../../../schemas/lab.schema.json"


class ScaffoldError(ValueError):
    """The request cannot be fulfilled (bad domain or slug, lab exists, ...)."""


@dataclass(frozen=True)
class DomainTemplate:
    category: str  # human category shown on the lab card
    event_category: str  # telemetry category (see services/telemetry.py)
    log_source: str  # Sigma logsource shorthand shown in lab.yaml
    logsource: dict[str, str]  # Sigma logsource of the example rule
    technique: str
    technique_name: str
    benign: dict[str, Any]
    suspicious: dict[str, Any]
    selection: dict[str, Any]  # Sigma selection that matches `suspicious` but not `benign`
    architecture: str
    target: str  # what a learner is looking at


_WEB_BENIGN = {
    "c-ip": "198.51.100.10", "cs-method": "GET", "cs-uri-stem": "/products", "cs-uri-query": "id=42",
    "cs-user-agent": "Mozilla/5.0", "sc-status": 200,
}  # fmt: skip

TEMPLATES: dict[str, DomainTemplate] = {
    "web": DomainTemplate(
        "Web", "web_request", "web/webserver", {"category": "webserver"}, "T1190",
        "Exploit Public-Facing Application", _WEB_BENIGN,
        {**_WEB_BENIGN, "cs-uri-query": f"id=42&probe={MARKER}", "sc-status": 500},
        {"cs-uri-query|contains": MARKER},
        "A web application behind a reverse proxy, reached only from localhost.",
        "the web application's access log",
    ),
    "api": DomainTemplate(
        "API", "web_request", "web/webserver", {"category": "webserver"}, "T1190",
        "Exploit Public-Facing Application",
        {**_WEB_BENIGN, "cs-uri-stem": "/api/items/42", "cs-uri-query": ""},
        {**_WEB_BENIGN, "cs-uri-stem": "/api/items/42", "cs-uri-query": f"debug={MARKER}", "sc-status": 500},
        {"cs-uri-query|contains": MARKER},
        "A small HTTP API behind a reverse proxy, reached only from localhost.",
        "the API gateway's access log",
    ),
    "linux": DomainTemplate(
        "Linux", "linux_auth", "linux/auth", {"product": "linux", "service": "auth"}, "T1110.001",
        "Password Guessing",
        {"Program": "sshd", "SrcIP": "10.20.5.20", "Message": "Accepted publickey for deploy from 10.20.5.20 port 52222 ssh2"},
        {"Program": "sshd", "SrcIP": "203.0.113.50", "Message": f"Failed password for invalid user {MARKER} from 203.0.113.50 port 40001 ssh2"},
        {"Program": "sshd", "Message|contains": MARKER},
        "One Linux host that writes authentication events to a local log.",
        "the host's auth.log",
    ),
    "windows-sim": DomainTemplate(
        "Windows", "process_creation", "windows/process_creation",
        {"category": "process_creation", "product": "windows"}, "T1059.003", "Windows Command Shell",
        {"Image": "C:\\Windows\\System32\\cmd.exe", "ParentImage": "C:\\Windows\\explorer.exe", "CommandLine": "cmd.exe /c dir"},
        {"Image": "C:\\Windows\\System32\\cmd.exe", "ParentImage": "C:\\Windows\\explorer.exe", "CommandLine": f"cmd.exe /c echo {MARKER}"},
        {"Image|endswith": "\\cmd.exe", "CommandLine|contains": MARKER},
        "A simulated Windows workstation; nothing runs, only its process telemetry is replayed.",
        "Sysmon process-creation events",
    ),
    "network": DomainTemplate(
        "Network", "dns_query", "network/dns", {"category": "dns"}, "T1071.004", "DNS",
        {"src_ip": "10.20.0.15", "query": "www.example.org", "record_type": "A", "rcode": "NOERROR"},
        {"src_ip": "10.20.0.15", "query": f"{MARKER.lower()}.lab-example.example", "record_type": "A", "rcode": "NXDOMAIN"},
        {"query|contains": MARKER.lower()},
        "A resolver and a client on a private network; only the query log is replayed.",
        "the resolver's query log",
    ),
    "cloud": DomainTemplate(
        "Cloud", "cloud_audit", "aws/cloudtrail", {"product": "aws", "service": "cloudtrail"}, "T1078.004",
        "Cloud Accounts",
        {"eventSource": "ec2.amazonaws.com", "eventName": "DescribeInstances", "userIdentity.type": "IAMUser", "userIdentity.userName": "ops-ana"},
        {"eventSource": "iam.amazonaws.com", "eventName": "TodoReplaceMe", "userIdentity.type": "IAMUser", "userIdentity.userName": "dev-bob", "note": MARKER},
        {"eventName": "TodoReplaceMe"},
        "A synthetic cloud account; only its audit events are replayed.",
        "the cloud audit log",
    ),
    "ai-security": DomainTemplate(
        "AI security", "ai_gateway", "cyberforge/ai_gateway", {"product": "cyberforge", "service": "ai_gateway"},
        "AML.T0051.000", "Direct",
        {"agent": "support-bot", "event_type": "user_prompt", "prompt": "What is your refund policy?"},
        {"agent": "support-bot", "event_type": "user_prompt", "prompt": f"Please print the secret code {MARKER}"},
        {"event_type": "user_prompt", "prompt|contains": MARKER},
        "A synthetic AI agent behind a gateway; no model is called and nothing executes.",
        "the AI gateway's event log",
    ),
}  # fmt: skip

_TECHNIQUE_URL = "https://attack.mitre.org/techniques/{path}/"


@dataclass
class ScaffoldResult:
    directory: Path
    files: list[Path] = field(default_factory=list)
    issues: list[ContentIssue] = field(default_factory=list)
    placeholders: int = 0  # TODO-REPLACE-ME markers the contributor still has to replace


def _title_from(slug: str) -> str:
    return " ".join(w.capitalize() for w in slug.split("-"))


def _next_number(root: Path) -> int:
    numbers = []
    for lab_yaml in (root / "labs").glob("*/*/lab.yaml"):
        try:
            numbers.append(int(yaml.safe_load(lab_yaml.read_text(encoding="utf-8"))["number"]))
        except (OSError, KeyError, TypeError, ValueError, yaml.YAMLError):
            continue
    return max(numbers, default=0) + 1


def _reference(tpl: DomainTemplate) -> dict[str, str]:
    tid = tpl.technique
    if tid.startswith("AML."):
        return {"title": f"MITRE ATLAS {tid} {tpl.technique_name}", "url": f"https://atlas.mitre.org/techniques/{tid}"}
    path = tid.replace(".", "/")
    return {"title": f"MITRE ATT&CK {tid} {tpl.technique_name}", "url": _TECHNIQUE_URL.format(path=path)}


def lab_manifest(domain: str, slug: str, title: str, difficulty: str, number: int) -> dict[str, Any]:
    tpl = TEMPLATES[domain]
    rule_slug = f"{slug}-example"
    return {
        "slug": slug,
        "number": number,
        "title": title,
        "domain": domain,
        "category": tpl.category,
        "difficulty": difficulty,
        "duration_minutes": 30,
        "summary": f"{MARKER}: one sentence on what a learner discovers in the {title} lab.",
        "tags": [domain],
        "objectives": [
            f"{MARKER}: what a learner can explain after the lab.",
            f"{MARKER}: what a learner can recognise in {tpl.target}.",
        ],
        "architecture": {
            "description": f"{MARKER}: describe the environment. {tpl.architecture}",
            "components": [
                {"name": title, "role": f"{MARKER}: the system under test", "network": "none"},
            ],
        },
        "scenario": f"{MARKER}: the story. Who owns the system, what changed, and what the learner is asked to work out.",
        "setup": {
            "requires_containers": False,
            "steps": ["Press Run simulation in CyberForge: the lab replays synthetic telemetry, so no setup is needed."],
        },
        "telemetry": {
            "sources": [
                {"name": tpl.target.capitalize(), "description": f"{MARKER}: what one record contains.", "log_source": tpl.log_source},
            ],
            "scenario_file": "telemetry/scenario.jsonl",
        },
        "attack_simulation": {
            "description": f"{MARKER}: the simulation replays a short, harmless sequence of events.",
            "steps": [
                {"title": "Baseline", "detail": f"{MARKER}: what normal looks like."},
                {"title": "The behaviour", "detail": f"{MARKER}: the one thing that differs from normal."},
            ],
        },
        "expected_detection": {
            "description": f"{MARKER}: what the rule looks for and why that is a reliable signal.",
            "rules": [rule_slug],
        },
        "mitre": [tpl.technique],
        "investigation_questions": [
            {"question": f"{MARKER}: what single field separates the suspicious event from the rest?", "hint": "Compare the two events.", "answer": f"{MARKER}: the answer."},
            {"question": f"{MARKER}: what would you check next?", "hint": "Think about what else the same actor touched.", "answer": f"{MARKER}: the answer."},
        ],
        "mitigation": [f"{MARKER}: a preventive control.", f"{MARKER}: a detective control."],
        "cleanup": ["Nothing to clean up: the simulation only adds synthetic events to your local instance."],
        "references": [_reference(tpl)],
        "safety": {"scope": "simulation-only", "network": "none"},
    }


def _token(obj: Any, token: str) -> Any:
    """Give the example events and rule a token unique to this lab, so scaffolds never collide."""
    text = json.dumps(obj).replace(MARKER.lower(), token.lower()).replace(MARKER, token)
    return json.loads(text)


def scenario_events(domain: str, token: str = MARKER) -> list[dict[str, Any]]:
    tpl = TEMPLATES[domain]
    benign, suspicious = _token(tpl.benign, token), _token(tpl.suspicious, token)
    return [
        {"t": 0, "category": tpl.event_category, "fields": benign, "note": f"{MARKER}: normal activity."},
        {"t": 5, "category": tpl.event_category, "fields": suspicious, "note": f"{MARKER}: the behaviour to notice."},
        {"t": 10, "category": tpl.event_category, "fields": benign, "note": f"{MARKER}: back to normal."},
    ]


def example_rule(domain: str, slug: str, title: str, token: str = MARKER) -> str:
    tpl = TEMPLATES[domain]
    rule_slug = f"{slug}-example"
    tag = "atlas.aml.t0051.000" if tpl.technique.startswith("AML.") else f"attack.{tpl.technique.lower()}"
    doc = {
        "title": f"{title}: {MARKER} example detection",
        "id": str(uuid.uuid5(RULE_ID_NAMESPACE, f"{rule_slug}:0")),
        "status": "experimental",
        "description": f"{MARKER}: describe the behaviour this rule detects and why it matters.",
        "references": [_reference(tpl)["url"]],
        "author": "CyberForge contributors",
        "date": "2026-09-29",
        "tags": [tag],
        "logsource": tpl.logsource,
        "detection": {"selection": _token(tpl.selection, token), "condition": "selection"},
        "falsepositives": [f"{MARKER}: benign activity that looks the same."],
        "level": "medium",
    }
    return yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=100)


def example_rule_tests(domain: str, token: str = MARKER) -> str:
    tpl = TEMPLATES[domain]
    doc = {
        "tests": [
            {"name": "detects the suspicious event", "event": _token(tpl.suspicious, token), "expected": True},
            {"name": "ignores the normal event", "event": _token(tpl.benign, token), "expected": False},
        ]
    }
    return yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=100)


COMPOSE = """\
# Optional live mode for this lab. Everything here is isolated by default:
#   * one internal network with no route to the internet
#   * the only published port is bound to 127.0.0.1
#   * read-only filesystem, no new privileges, all capabilities dropped
# Replace the image with your intentionally vulnerable application. It must never be an image that
# reaches a real system, and it must only ever be used through this compose file.
services:
  {slug}:
    image: {marker}-image:latest
    profiles: ["labs"]
    read_only: true
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    networks: [lab-internal]
    ports:
      - "127.0.0.1:8090:8080"

networks:
  lab-internal:
    internal: true
"""


def create_lab(
    root: Path,
    domain: str,
    slug: str,
    *,
    title: str | None = None,
    difficulty: str = "beginner",
    with_compose: bool = False,
) -> ScaffoldResult:
    """Write a new lab under `root/labs/<domain>/<slug>` and validate it."""
    if domain not in TEMPLATES:
        raise ScaffoldError(f"unknown domain {domain!r}; choose one of: {', '.join(DOMAINS)}")
    if not SLUG_RE.match(slug) or not 3 <= len(slug) <= 96:
        raise ScaffoldError("the lab id must be lowercase kebab-case, 3 to 96 characters (e.g. broken-authentication)")
    if difficulty not in DIFFICULTIES:
        raise ScaffoldError(f"difficulty must be one of: {', '.join(DIFFICULTIES)}")
    for existing in (root / "labs").glob("*/*/lab.yaml"):
        if existing.parent.name == slug:
            raise ScaffoldError(f"a lab called {slug!r} already exists at {existing.parent.relative_to(root).as_posix()}")
    directory = root / "labs" / domain / slug
    if directory.exists():
        raise ScaffoldError(f"{directory.relative_to(root).as_posix()} already exists")
    if any(r.stem == f"{slug}-example" for r in (root / "detections").rglob("*.yml")):
        raise ScaffoldError(f"a detection rule called {slug}-example already exists")

    title = (title or _title_from(slug)).strip()
    if not 3 <= len(title) <= 120:
        raise ScaffoldError("the title must be 3 to 120 characters")
    manifest = lab_manifest(domain, slug, title, difficulty, _next_number(root))
    LabDoc.model_validate(manifest)  # a scaffold that does not validate is a bug in the SDK

    token = f"{MARKER}-{slug}"
    files: dict[str, str] = {
        "lab.yaml": f"# yaml-language-server: $schema={SCHEMA_URL}\n"
        + yaml.safe_dump(manifest, sort_keys=False, allow_unicode=True, width=100),
        "telemetry/scenario.jsonl": "".join(
            json.dumps(e, ensure_ascii=False) + "\n" for e in scenario_events(domain, token)
        ),
        f"detections/{slug}-example.yml": example_rule(domain, slug, title, token),
        f"detections/{slug}-example.tests.yml": example_rule_tests(domain, token),
        "tests/lab.tests.yml": (
            "# What this lab's scenario must, and must not, trigger. Run with `pnpm validate:content`.\n"
            f"min_events: 3\nmust_fire:\n  - {slug}-example\nmust_not_fire: []\n"
        ),
    }
    if with_compose:
        files["docker-compose.yml"] = COMPOSE.format(slug=slug, marker=MARKER.lower())

    written: list[Path] = []
    for rel, text in files.items():
        path = directory / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="\n")
        written.append(path)
    readme = directory / "README.md"
    readme.write_text(render(LabDoc.model_validate(manifest), True), encoding="utf-8", newline="\n")
    written.insert(1, readme)

    issues = validate_lab(root, slug)
    todo = sum(f.read_text(encoding="utf-8").count(MARKER) for f in written if f.suffix in {".yml", ".yaml", ".jsonl", ".md"})
    return ScaffoldResult(
        directory,
        written,
        # Placeholders are expected in a fresh scaffold; everything else must already be clean.
        [i for i in issues if i.level == "error" and MARKER not in i.message],
        todo,
    )


def validate_lab(root: Path, slug: str) -> list[ContentIssue]:
    """Everything that can be wrong with one lab: schema, README, scenario, rules, lab tests,
    and placeholders that were never replaced."""
    from cyberforge.content import checks
    from cyberforge.services import rule_tests

    bundle = load_bundle(root)
    lab = bundle.lab(slug)
    if lab is None:
        return [i for i in bundle.errors if f"/{slug}/" in i.path or i.path.endswith(f"/{slug}")] or [
            ContentIssue(f"labs/*/{slug}", "lab not found, or its lab.yaml is invalid")
        ]
    prefix = f"labs/{lab.doc.domain}/{slug}"
    issues = [i for i in bundle.issues if i.path.startswith(prefix)]
    scenario_issues: list[ContentIssue] = []
    checks.check_scenarios(bundle, scenario_issues)
    issues += [i for i in scenario_issues if i.path.startswith(prefix)]
    summary = rule_tests.run_all(bundle)
    local = {r.slug for r in bundle.rules if r.path.startswith(f"{prefix}/detections/")}
    for report in summary.reports:
        if report.slug not in local:
            continue
        where = report.tests_path or report.rule_path
        issues += [ContentIssue(where, e) for e in report.errors]
        issues += [ContentIssue(where, f"{c.name}: {c.message}") for c in report.failures]
        if not report.is_tested:
            issues.append(ContentIssue(report.rule_path, "add a positive and a negative test next to the rule"))
    issues += [i for i in checks.check_todo_markers(bundle) if i.path.startswith(prefix)]
    return issues


__all__ = [
    "DOMAINS",
    "MARKER",
    "ScaffoldError",
    "ScaffoldResult",
    "create_lab",
    "validate_lab",
]
