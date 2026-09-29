#!/usr/bin/env python3
"""Validate all CyberForge content. Run with `pnpm validate:content`.

Checks
  * lab.yaml metadata against the schema, plus README and scenario files
  * Sigma rules (syntax via pySigma, lint warnings), YARA (plyara) and Suricata structure
  * every MITRE ATT&CK / ATLAS identifier referenced anywhere exists in mitre/*.json
  * every lab's scenario actually triggers the detection rules it declares
  * relative links in Markdown files resolve; external URLs are well-formed
    (add --check-external to also request them over the network)

Exit status is non-zero if any error is found. Warnings never fail the run.
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api"))

from cyberforge.content.loader import (
    ContentBundle,
    ContentIssue,
    load_bundle,
)
from cyberforge.services import simulation
from cyberforge.services.sigma_engine import (
    EvalEvent,
    SigmaEngine,
    SigmaEngineError,
    compile_rule,
)

LINK = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)")
FENCE = re.compile(r"```.*?```", re.DOTALL)
URL = re.compile(r"https?://[^\s)>\]\"'`]+")
SKIP_DIRS = {
    "node_modules",
    ".venv",
    ".next",
    ".git",
    ".data",
    "__pycache__",
    ".pytest_cache",
}


def markdown_files() -> list[Path]:
    files = [
        p
        for p in ROOT.rglob("*.md")
        if not (set(p.relative_to(ROOT).parts) & SKIP_DIRS)
    ]
    return sorted(files)


def check_scenarios(bundle: ContentBundle, issues: list[ContentIssue]) -> None:
    """Each lab's scenario must fire exactly the rules its lab.yaml declares."""
    compiled = {}
    for rule in bundle.rules:
        if rule.format != "sigma":
            continue
        try:
            compiled[rule.slug] = compile_rule(rule.slug, rule.content)
        except SigmaEngineError as exc:
            issues.append(ContentIssue(rule.path, f"rule cannot be evaluated: {exc}"))
    engine = SigmaEngine(compiled.values())
    start = datetime(2026, 1, 1, tzinfo=UTC)
    for lab in bundle.labs:
        rows = simulation.materialize(lab.scenario, start)
        events = [
            EvalEvent(i, r["timestamp"], r["fields"], r["logsource"])
            for i, r in enumerate(rows)
        ]
        fired = {h.rule.slug for h in engine.evaluate(events)}
        expected = set(lab.doc.expected_detection.rules)
        where = f"labs/{lab.doc.domain}/{lab.doc.slug}"
        for slug in sorted(expected - fired):
            issues.append(
                ContentIssue(where, f"scenario does not trigger declared rule {slug!r}")
            )
        for slug in sorted(fired - expected):
            issues.append(
                ContentIssue(
                    where,
                    f"scenario also triggers undeclared rule {slug!r}",
                    level="warning",
                )
            )


def check_markdown_links(issues: list[ContentIssue]) -> set[str]:
    external: set[str] = set()
    for path in markdown_files():
        text = FENCE.sub("", path.read_text(encoding="utf-8"))
        rel = path.relative_to(ROOT).as_posix()
        for target in LINK.findall(text):
            if target.startswith(("http://", "https://")):
                external.add(target.rstrip(".,;"))
                continue
            if target.startswith(("mailto:", "#")):
                continue
            file_part = target.split("#", 1)[0]
            if file_part and not (path.parent / file_part).resolve().exists():
                issues.append(ContentIssue(rel, f"broken relative link: {target}"))
    return external


def collect_content_urls(bundle: ContentBundle) -> set[str]:
    urls: set[str] = set()
    for lab in bundle.labs:
        urls.update(str(r.url) for r in lab.doc.references)
    for rule in bundle.rules:
        urls.update(u for u in rule.references if u.startswith("http"))
    if bundle.thirty_days:
        for day in bundle.thirty_days.days:
            urls.update(str(r.url) for r in day.reading)
    return urls


def check_url_shapes(urls: set[str], issues: list[ContentIssue]) -> None:
    for url in sorted(urls):
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.netloc or " " in url:
            issues.append(ContentIssue("urls", f"malformed URL: {url}"))
        elif parsed.scheme == "http" and parsed.hostname not in (
            "localhost",
            "127.0.0.1",
        ):
            issues.append(
                ContentIssue(
                    "urls", f"use https where possible: {url}", level="warning"
                )
            )


def check_external(urls: set[str], issues: list[ContentIssue]) -> None:
    def probe(url: str) -> tuple[str, str | None]:
        req = urllib.request.Request(
            url, method="GET", headers={"User-Agent": "cyberforge-link-check"}
        )
        try:
            with urllib.request.urlopen(req, timeout=15):
                return url, None
        except urllib.error.HTTPError as exc:
            # Bot protection commonly answers 403/429/999; only definite "gone" statuses fail.
            return (url, f"HTTP {exc.code}") if exc.code in (404, 410) else (url, None)
        except Exception as exc:  # noqa: BLE001
            return url, type(exc).__name__

    with ThreadPoolExecutor(max_workers=8) as pool:
        for url, problem in pool.map(probe, sorted(urls)):
            if problem:
                issues.append(ContentIssue("urls", f"unreachable ({problem}): {url}"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--check-external", action="store_true", help="also request external URLs"
    )
    parser.add_argument("--quiet", action="store_true", help="print errors only")
    args = parser.parse_args()

    bundle = load_bundle(ROOT)
    issues = list(bundle.issues)
    check_scenarios(bundle, issues)
    external = check_markdown_links(issues)
    urls = collect_content_urls(bundle) | external
    check_url_shapes(urls, issues)
    if args.check_external:
        check_external(urls, issues)

    errors = [i for i in issues if i.level == "error"]
    warnings = [i for i in issues if i.level == "warning"]
    if not args.quiet:
        for issue in warnings:
            print(issue)
    for issue in errors:
        print(issue)

    by_format: dict[str, int] = {}
    for rule in bundle.rules:
        by_format[rule.format] = by_format.get(rule.format, 0) + 1
    techniques = {t for lab in bundle.labs for t in lab.doc.mitre} | {
        t for r in bundle.rules for t in r.technique_ids
    }
    print(
        f"\nchecked {len(bundle.labs)} labs, {len(bundle.rules)} rules "
        f"({', '.join(f'{n} {k}' for k, n in sorted(by_format.items()))}), "
        f"{len(techniques)} mapped MITRE techniques, {len(bundle.incidents)} incidents, "
        f"{len(bundle.tracks)} learning tracks, {len(urls)} URLs"
    )
    print(f"{len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
