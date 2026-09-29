"""Community lab SDK: scaffolding, lab tests, JSON Schema, and the example lab."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest
import yaml

from cyberforge import cli
from cyberforge.content import scaffold
from cyberforge.content.loader import ContentBundle, load_bundle
from cyberforge.content.schemas import LabDoc

REPO = Path(__file__).resolve().parents[3]


@pytest.fixture()
def light_root(tmp_path: Path) -> Path:
    """A minimal repository: just the MITRE data, enough to scaffold and validate one lab."""
    (tmp_path / "mitre").mkdir()
    for name in ("attack.json", "atlas.json"):
        shutil.copy(REPO / "mitre" / name, tmp_path / "mitre" / name)
    (tmp_path / "labs").mkdir()
    (tmp_path / "detections" / "sigma").mkdir(parents=True)
    return tmp_path


@pytest.mark.parametrize("domain", scaffold.DOMAINS)
def test_every_domain_scaffolds_a_lab_that_validates(light_root: Path, domain: str) -> None:
    result = scaffold.create_lab(light_root, domain, "my-first-lab")
    assert result.issues == []
    assert result.placeholders > 10
    lab_dir = light_root / "labs" / domain / "my-first-lab"
    for rel in (
        "lab.yaml",
        "README.md",
        "telemetry/scenario.jsonl",
        "detections/my-first-lab-example.yml",
        "detections/my-first-lab-example.tests.yml",
        "tests/lab.tests.yml",
    ):
        assert (lab_dir / rel).is_file(), rel
    assert not (lab_dir / "docker-compose.yml").exists()
    doc = LabDoc.model_validate(yaml.safe_load((lab_dir / "lab.yaml").read_text(encoding="utf-8")))
    assert doc.slug == "my-first-lab" and doc.domain == domain and doc.expected_detection.rules == ["my-first-lab-example"]
    assert (lab_dir / "lab.yaml").read_text(encoding="utf-8").startswith("# yaml-language-server: $schema=")


def test_the_scaffolded_rule_is_a_tested_rule(light_root: Path) -> None:
    scaffold.create_lab(light_root, "windows-sim", "encoded-thing")
    bundle = load_bundle(light_root)
    from cyberforge.services import rule_tests

    summary = rule_tests.run_all(bundle)
    (report,) = summary.reports
    assert report.slug == "encoded-thing-example" and report.passed and report.is_tested


def test_placeholders_block_validation_until_they_are_replaced(light_root: Path) -> None:
    scaffold.create_lab(light_root, "linux", "ssh-lab")
    problems = scaffold.validate_lab(light_root, "ssh-lab")
    assert problems and all(scaffold.MARKER in p.message for p in problems)

    lab_dir = light_root / "labs" / "linux" / "ssh-lab"
    for path in lab_dir.rglob("*"):
        if path.is_file():
            path.write_text(path.read_text(encoding="utf-8").replace(scaffold.MARKER, "DONE"), encoding="utf-8")
    assert [p for p in scaffold.validate_lab(light_root, "ssh-lab") if p.level == "error"] == []


def test_a_broken_scenario_is_caught(light_root: Path) -> None:
    scaffold.create_lab(light_root, "network", "dns-lab")
    lab_dir = light_root / "labs" / "network" / "dns-lab"
    (lab_dir / "telemetry" / "scenario.jsonl").write_text(
        '{"t":0,"category":"dns_query","fields":{"query":"www.example.org","rcode":"NOERROR"}}\n', encoding="utf-8"
    )
    messages = " ".join(i.message for i in scaffold.validate_lab(light_root, "dns-lab"))
    assert "does not trigger declared rule" in messages
    assert "must_fire" in messages and "expected at least 3" in messages


def test_lab_tests_can_forbid_a_rule(light_root: Path) -> None:
    scaffold.create_lab(light_root, "cloud", "cloud-lab")
    lab_dir = light_root / "labs" / "cloud" / "cloud-lab"
    (lab_dir / "tests" / "lab.tests.yml").write_text(
        "min_events: 3\nmust_fire: [cloud-lab-example]\nmust_not_fire: [cloud-lab-example]\n", encoding="utf-8"
    )
    messages = " ".join(i.message for i in scaffold.validate_lab(light_root, "cloud-lab"))
    assert "must_not_fire: 'cloud-lab-example' fired" in messages


def test_compose_option_writes_an_isolated_file(light_root: Path) -> None:
    scaffold.create_lab(light_root, "web", "web-lab", with_compose=True)
    compose = yaml.safe_load((light_root / "labs" / "web" / "web-lab" / "docker-compose.yml").read_text(encoding="utf-8"))
    service = compose["services"]["web-lab"]
    assert service["ports"] == ["127.0.0.1:8090:8080"]  # localhost only
    assert service["read_only"] is True and service["cap_drop"] == ["ALL"]
    assert compose["networks"]["lab-internal"]["internal"] is True


def test_numbers_continue_from_the_highest_existing_lab(light_root: Path) -> None:
    scaffold.create_lab(light_root, "web", "first-lab")
    result = scaffold.create_lab(light_root, "api", "second-lab")
    doc = yaml.safe_load((result.directory / "lab.yaml").read_text(encoding="utf-8").split("\n", 1)[1])
    assert doc["number"] == 2


@pytest.mark.parametrize(
    ("domain", "slug", "message"),
    [
        ("mainframe", "some-lab", "unknown domain"),
        ("web", "Some_Lab", "kebab-case"),
        ("web", "../escape", "kebab-case"),
        ("web", "ab", "kebab-case"),
        ("web", "a/b", "kebab-case"),
    ],
)
def test_bad_input_is_rejected_before_anything_is_written(light_root: Path, domain: str, slug: str, message: str) -> None:
    with pytest.raises(scaffold.ScaffoldError, match=message):
        scaffold.create_lab(light_root, domain, slug)
    assert list((light_root / "labs").rglob("*")) == []


def test_an_existing_lab_or_rule_is_never_overwritten(light_root: Path) -> None:
    scaffold.create_lab(light_root, "web", "taken-lab")
    with pytest.raises(scaffold.ScaffoldError, match="already exists"):
        scaffold.create_lab(light_root, "api", "taken-lab")
    with pytest.raises(scaffold.ScaffoldError, match="difficulty"):
        scaffold.create_lab(light_root, "web", "other-lab", difficulty="impossible")


def test_scaffolds_do_not_collide_with_the_shipped_detections(tmp_path: Path) -> None:
    """The placeholder events must not trip any real rule in a full repository."""
    for name in ("labs", "detections", "mitre", "datasets", "packages", "examples", "docs", "stories", "demos"):
        shutil.copytree(REPO / name, tmp_path / name)
    for domain in ("web", "ai-security", "windows-sim"):
        result = scaffold.create_lab(tmp_path, domain, f"probe-{domain}")
        assert result.issues == [], domain
    assert [i for i in scaffold.validate_lab(tmp_path, "probe-web") if scaffold.MARKER not in i.message and i.level == "error"] == []


def test_cli_lab_create_and_validate(light_root: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["--root", str(light_root), "lab", "create", "linux", "cli-lab"]) == 0
    out = capsys.readouterr().out
    assert "Created labs/linux/cli-lab/" in out and "The scaffold validates" in out
    assert cli.main(["--root", str(light_root), "lab", "validate", "cli-lab"]) == 1  # placeholders remain
    assert cli.main(["--root", str(light_root), "lab", "create", "linux", "cli-lab"]) == 2  # already exists
    assert "already exists" in capsys.readouterr().err


# --- the shipped example lab ----------------------------------------------------------------------


def test_the_example_lab_is_complete_and_valid(tmp_path: Path) -> None:
    for name in ("mitre", "detections"):
        shutil.copytree(REPO / name, tmp_path / name)
    target = tmp_path / "labs" / "linux" / "sudoers-edit-detection"
    shutil.copytree(REPO / "examples" / "custom-lab", target)
    (tmp_path / "docs").mkdir()
    # the README is generated from lab.yaml, so regenerate it exactly as `pnpm content:labs` does
    from cyberforge.content.lab_readme import render

    doc = LabDoc.model_validate(yaml.safe_load((target / "lab.yaml").read_text(encoding="utf-8")))
    (target / "README.md").write_text(render(doc, True), encoding="utf-8")
    example_readme = render(doc, True, security_doc="../../docs/security-model.md")
    problems = scaffold.validate_lab(tmp_path, "sudoers-edit-detection")
    assert problems == []
    shipped = (REPO / "examples" / "custom-lab" / "README.md").read_text(encoding="utf-8")
    normalise = lambda text: text.replace("\r\n", "\n")  # noqa: E731
    assert normalise(shipped) == normalise(example_readme), "re-render examples/custom-lab/README.md"


def test_lab_local_rules_are_loaded_like_any_other(light_root: Path) -> None:
    scaffold.create_lab(light_root, "web", "local-rules-lab")
    bundle = load_bundle(light_root)
    rule = bundle.rule("local-rules-lab-example")
    assert rule is not None and rule.path.startswith("labs/web/local-rules-lab/detections/")
    assert rule.tests_path and rule.tests_path.endswith("local-rules-lab-example.tests.yml")


# --- JSON Schema ----------------------------------------------------------------------------------


def test_committed_json_schemas_are_up_to_date() -> None:
    result = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "export_schemas.py"), "--check"],
        capture_output=True, text=True, check=False,
    )  # fmt: skip
    assert result.returncode == 0, result.stderr


def test_the_lab_schema_describes_the_manifest_fields() -> None:
    import json

    schema = json.loads((REPO / "schemas" / "lab.schema.json").read_text(encoding="utf-8"))
    props = set(schema["properties"])
    assert {"slug", "title", "summary", "difficulty", "category", "duration_minutes", "tags", "objectives",
            "mitre", "telemetry", "expected_detection", "architecture", "safety", "cleanup"} <= props  # fmt: skip
    assert schema["additionalProperties"] is False


def test_shipped_labs_still_validate_after_the_sdk_changes(bundle: ContentBundle) -> None:
    assert len(bundle.labs) >= 20
    assert [i for i in bundle.errors if i.path.startswith("labs/")] == []
