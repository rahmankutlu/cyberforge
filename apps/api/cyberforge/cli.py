"""The `cyberforge` command line: content tooling for contributors and CI.

    python -m cyberforge detections test          run every rule's tests
    python -m cyberforge detections quality       per-rule quality checks
    python -m cyberforge content stats            counts generated from the repository
    python -m cyberforge validate                 schemas, MITRE ids, scenarios, rule tests

It is deliberately small: it reads files, evaluates rules with the same engine as the SOC, and
prints results. It never touches the network and never executes rule or lab content.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence
from pathlib import Path

from cyberforge import __version__


def find_root(explicit: str | None = None) -> Path:
    """Repository root: --root, $CYBERFORGE_CONTENT_DIR, the working directory, then the package."""
    candidates = [explicit, os.environ.get("CYBERFORGE_CONTENT_DIR"), str(Path.cwd())]
    candidates.append(str(Path(__file__).resolve()))
    for raw in candidates:
        if not raw:
            continue
        start = Path(raw).resolve()
        for parent in [start, *start.parents]:
            if (parent / "detections").is_dir() and (parent / "labs").is_dir():
                return parent
    raise SystemExit("error: could not find the CyberForge repository root; use --root")


class Style:
    """ANSI colour only when writing to a terminal (and NO_COLOR is unset)."""

    def __init__(self) -> None:
        self.on = sys.stdout.isatty() and "NO_COLOR" not in os.environ

    def _wrap(self, code: str, text: str) -> str:
        return f"\033[{code}m{text}\033[0m" if self.on else text

    def ok(self, text: str) -> str:
        return self._wrap("32", text)

    def bad(self, text: str) -> str:
        return self._wrap("31", text)

    def dim(self, text: str) -> str:
        return self._wrap("2", text)

    def bold(self, text: str) -> str:
        return self._wrap("1", text)


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


# --- detections test ---------------------------------------------------------------------------


def cmd_detections_test(args: argparse.Namespace) -> int:
    from cyberforge.content.loader import load_bundle
    from cyberforge.services import rule_tests

    root = find_root(args.root)
    bundle = load_bundle(root)
    summary = rule_tests.run_all(bundle, args.rule or None)
    style = Style()
    github = os.environ.get("GITHUB_ACTIONS") == "true"

    # Rule files that do not load (bad YAML, bad MITRE id, ...) fail the gate as well.
    sigma_errors = [
        i
        for i in bundle.errors
        if i.path.startswith("detections/sigma/") and (not args.rule or any(r in i.path for r in args.rule))
    ]
    require_failures = [
        r for r in summary.reports if args.require_tests and not r.is_tested and not r.errors
    ]

    if args.json:
        print(json.dumps(_summary_json(summary, sigma_errors, require_failures), indent=2))
    else:
        for report in summary.reports:
            if report.tests_path is None:
                marker = style.bad("✗") if args.require_tests else style.dim("○")
                print(f"{marker} {report.slug} {style.dim('(no tests)')}")
                continue
            print(f"{style.ok('✓') if report.passed else style.bad('✗')} {report.slug}")
            for err in report.errors:
                print(f"  {style.bad('✗')} {report.tests_path}: {err}")
            for case in report.cases:
                print(f"  {style.ok('✓') if case.passed else style.bad('✗')} {case.name}")
                if not case.passed:
                    print(f"      {case.message}")
            if args.require_tests and not report.is_tested and not report.errors:
                print(f"  {style.bad('✗')} needs at least one positive and one negative test")
        for orphan in summary.orphans:
            print(f"{style.bad('✗')} {orphan}: tests file has no matching rule")
        for issue in sigma_errors:
            print(f"{style.bad('✗')} {issue.path}: {issue.message}")
        print()
        print(f"{_plural(summary.rule_count, 'rule')}")
        print(f"{_plural(summary.test_count, 'test')}")
        failures = summary.failure_count + summary.error_count + len(sigma_errors)
        print(f"{_plural(failures + len(require_failures), 'failure')}")
        print(
            f"Detection test coverage: {summary.tested_rules}/{summary.rule_count} rules "
            f"({summary.coverage_percent}%)"
        )

    if github:
        _github_annotations(summary, sigma_errors, require_failures)
    if args.summary_file or os.environ.get("GITHUB_STEP_SUMMARY"):
        target = args.summary_file or os.environ["GITHUB_STEP_SUMMARY"]
        with open(target, "a", encoding="utf-8") as handle:
            handle.write(_markdown_summary(summary, sigma_errors, require_failures))

    ok = summary.ok and not sigma_errors and not require_failures
    return 0 if ok else 1


def _summary_json(summary, sigma_errors, require_failures) -> dict:
    return {
        "rules": summary.rule_count,
        "tests": summary.test_count,
        "failures": summary.failure_count + summary.error_count + len(sigma_errors),
        "missing_tests": [r.slug for r in require_failures],
        "tested_rules": summary.tested_rules,
        "coverage_percent": summary.coverage_percent,
        "results": [
            {
                "rule": r.slug,
                "path": r.rule_path,
                "tests_path": r.tests_path,
                "errors": r.errors,
                "cases": [
                    {"name": c.name, "expected": c.expected, "passed": c.passed, "message": c.message}
                    for c in r.cases
                ],
            }
            for r in summary.reports
        ],
    }


def _github_annotations(summary, sigma_errors, require_failures) -> None:
    for report in summary.reports:
        target = report.tests_path or report.rule_path
        for err in report.errors:
            print(f"::error file={target}::{err}")
        for case in report.failures:
            print(f"::error file={target},title={report.slug}::{case.name}: {case.message}")
    for report in require_failures:
        print(f"::error file={report.rule_path}::{report.slug} needs a positive and a negative test")
    for issue in sigma_errors:
        print(f"::error file={issue.path}::{issue.message}")
    for orphan in summary.orphans:
        print(f"::error file={orphan}::tests file has no matching rule")


def _markdown_summary(summary, sigma_errors, require_failures) -> str:
    failed = summary.failure_count + summary.error_count + len(sigma_errors) + len(require_failures)
    lines = [
        "## Detection tests",
        "",
        f"**{'✅ Passed' if not failed else '❌ ' + _plural(failed, 'failure')}**: "
        f"{_plural(summary.rule_count, 'rule')}, {_plural(summary.test_count, 'test')}.",
        "",
        "| Detection test coverage | |",
        "| --- | --- |",
        f"| Sigma rules | {summary.rule_count} |",
        f"| Tested (≥1 positive and ≥1 negative case) | {summary.tested_rules} |",
        f"| Coverage | **{summary.coverage_percent}%** |",
        "",
    ]
    problems = [r for r in summary.reports if not r.passed]
    if problems or sigma_errors or require_failures or summary.orphans:
        lines += ["### Problems", ""]
        for report in problems:
            for err in report.errors:
                lines.append(f"- `{report.slug}`: {err}")
            for case in report.failures:
                lines.append(f"- `{report.slug}` / {case.name}: {case.message}")
        lines += [f"- `{r.slug}`: needs a positive and a negative test" for r in require_failures]
        lines += [f"- `{i.path}`: {i.message}" for i in sigma_errors]
        lines += [f"- `{o}`: tests file has no matching rule" for o in summary.orphans]
        lines.append("")
    return "\n".join(lines) + "\n"


# --- detections quality ------------------------------------------------------------------------


def cmd_detections_quality(args: argparse.Namespace) -> int:
    from cyberforge.content.loader import load_bundle
    from cyberforge.services import rule_quality, rule_tests

    bundle = load_bundle(find_root(args.root))
    summary = rule_tests.run_all(bundle)
    results = rule_quality.evaluate_all(bundle, summary)
    style = Style()
    if args.json:
        print(
            json.dumps(
                [
                    {
                        "rule": q.slug,
                        "passed": q.passed,
                        "total": q.total,
                        "checks": {c.id: c.passed for c in q.checks},
                    }
                    for q in results
                ],
                indent=2,
            )
        )
        return 0
    for q in sorted(results, key=lambda r: (r.passed, r.slug)):
        failed = [c.label for c in q.checks if not c.passed]
        line = f"{q.passed}/{q.total}  {q.slug}"
        print(line if not failed else f"{line}  {style.dim('missing: ' + ', '.join(failed))}")
    total = sum(q.passed for q in results)
    possible = sum(q.total for q in results)
    print(f"\n{total}/{possible} checks passed across {_plural(len(results), 'rule')}")
    return 0


# --- content stats -----------------------------------------------------------------------------


def cmd_content_stats(args: argparse.Namespace) -> int:
    from cyberforge.content import stats

    data = stats.collect(find_root(args.root))
    if args.json:
        print(json.dumps(data, indent=2))
    elif args.markdown:
        print(stats.as_markdown(data))
    else:
        for label, value in stats.as_rows(data):
            print(f"{value:>5}  {label}")
    return 0


# --- validate ----------------------------------------------------------------------------------


def cmd_validate(args: argparse.Namespace) -> int:
    from cyberforge.content import checks
    from cyberforge.content.loader import ContentIssue, load_bundle
    from cyberforge.services import rule_tests

    root = find_root(args.root)
    bundle = load_bundle(root)
    issues: list[ContentIssue] = list(bundle.issues)
    checks.check_scenarios(bundle, issues)
    issues += checks.check_datasets(bundle)
    summary = rule_tests.run_all(bundle)
    for report in summary.reports:
        issues += [ContentIssue(report.tests_path or report.rule_path, e) for e in report.errors]
        issues += [
            ContentIssue(report.tests_path or report.rule_path, f"{c.name}: {c.message}")
            for c in report.failures
        ]
    issues += [ContentIssue(o, "tests file has no matching rule") for o in summary.orphans]
    errors = [i for i in issues if i.level == "error"]
    warnings = [i for i in issues if i.level == "warning"]
    for issue in [*warnings, *errors]:
        print(issue)
    print(
        f"\n{len(bundle.labs)} labs, {len(bundle.rules)} rules, {summary.test_count} rule tests, "
        f"{len(errors)} error(s), {len(warnings)} warning(s)"
    )
    return 1 if errors else 0


# --- parser ------------------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="cyberforge", description=__doc__.splitlines()[0])
    parser.add_argument("--version", action="version", version=f"cyberforge {__version__}")
    parser.add_argument("--root", help="repository root (default: auto-detected)")
    sub = parser.add_subparsers(dest="group", required=True)

    detections = sub.add_parser("detections", help="detection rule tooling").add_subparsers(
        dest="command", required=True
    )
    test = detections.add_parser("test", help="run the tests that live next to each rule")
    test.add_argument("--rule", action="append", help="only this rule slug (repeatable)")
    test.add_argument("--json", action="store_true", help="machine-readable output")
    test.add_argument("--summary-file", help="append a Markdown summary here")
    test.add_argument(
        "--require-tests",
        action="store_true",
        help="fail when a Sigma rule has no positive and negative test",
    )
    test.set_defaults(func=cmd_detections_test)
    quality = detections.add_parser("quality", help="deterministic quality checks per rule")
    quality.add_argument("--json", action="store_true")
    quality.set_defaults(func=cmd_detections_quality)

    content = sub.add_parser("content", help="repository content").add_subparsers(
        dest="command", required=True
    )
    stats = content.add_parser("stats", help="counts generated from the repository")
    stats.add_argument("--json", action="store_true")
    stats.add_argument("--markdown", action="store_true")
    stats.set_defaults(func=cmd_content_stats)

    validate = sub.add_parser("validate", help="validate all content and run rule tests")
    validate.set_defaults(func=cmd_validate)

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure:
            reconfigure(encoding="utf-8", errors="replace")
    args = build_parser().parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    sys.exit(main())
