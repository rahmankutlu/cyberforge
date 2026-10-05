"""Attack stories: schema, cross-checks, synthetic-data guard rail and the API."""

from __future__ import annotations

import copy
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from cyberforge import cli
from cyberforge.content import checks
from cyberforge.content.loader import ContentBundle
from cyberforge.content.stories import StoryDoc
from cyberforge.content.synthetic import find_non_synthetic

REQUIRED_STORIES = {
    "compromised-developer-workstation",
    "suspicious-admin-account-activity",
    "web-application-intrusion",
    "credential-abuse-and-lateral-movement",
    "ai-agent-tool-abuse",
}


def _first(bundle: ContentBundle) -> dict[str, Any]:
    return bundle.stories[0].model_dump()


def _bundle_with(bundle: ContentBundle, data: dict[str, Any]) -> ContentBundle:
    clone = copy.copy(bundle)
    clone.stories = [StoryDoc.model_validate(data)]
    return clone


# --- shipped content ----------------------------------------------------------------------------


def test_the_five_launch_stories_exist(bundle: ContentBundle) -> None:
    assert {s.slug for s in bundle.stories} >= REQUIRED_STORIES


def test_shipped_stories_pass_every_cross_check(bundle: ContentBundle) -> None:
    errors = [i for i in checks.check_stories(bundle) if i.level == "error"]
    assert errors == []


def test_every_story_has_the_promised_sections(bundle: ContentBundle) -> None:
    for s in bundle.stories:
        assert s.title and s.summary and s.difficulty and s.duration_minutes
        assert len(s.attack_chain) >= 3, s.slug
        assert len(s.steps) >= 4 and s.briefing, s.slug
        assert s.containment and s.postmortem.lessons, s.slug
        assert any(step.questions or step.decision for step in s.steps), s.slug
        assert s.techniques(), s.slug
        assert all(step.evidence and step.telemetry for step in s.steps), s.slug


def test_stories_use_only_synthetic_addresses(bundle: ContentBundle) -> None:
    for s in bundle.stories:
        assert find_non_synthetic(s.model_dump_json()) == [], s.slug


def test_every_declared_detection_fires_at_its_step(bundle: ContentBundle) -> None:
    declared = sum(len(step.detections) for s in bundle.stories for step in s.steps)
    assert declared >= 30  # a real chain of detections, not decoration
    assert not [i for i in checks.check_stories(bundle) if "does not fire" in i.message]


# --- guard rails --------------------------------------------------------------------------------


def test_synthetic_guard_accepts_reserved_and_private_addresses() -> None:
    text = "203.0.113.5 198.51.100.7 192.0.2.1 10.1.2.3 172.16.0.9 192.168.1.1 http://x.lab.internal/a https://stage.cdn-lab.example/p 10.0.19045.3803"
    assert find_non_synthetic(text) == []


def test_synthetic_guard_flags_public_addresses_and_real_hosts() -> None:
    assert find_non_synthetic("connect to 8.8.8.8 now") == ["8.8.8.8"]
    assert find_non_synthetic("GET https://www.google.com/x") == ["www.google.com"]
    assert find_non_synthetic("http://1.2.3.4/x") == ["1.2.3.4"]


def test_a_public_address_in_a_story_fails_validation(bundle: ContentBundle) -> None:
    data = _first(bundle)
    data["steps"][0]["evidence"][0]["content"] += "\nsource 8.8.8.8"
    issues = checks.check_stories(_bundle_with(bundle, data))
    assert any("non-synthetic" in i.message and "8.8.8.8" in i.message for i in issues)


def test_a_declared_rule_that_does_not_fire_fails_validation(bundle: ContentBundle) -> None:
    data = _first(bundle)
    data["steps"][0]["detections"] = ["win-security-log-cleared"]
    issues = checks.check_stories(_bundle_with(bundle, data))
    assert any("does not fire" in i.message for i in issues)


def test_an_unknown_rule_or_technique_fails_validation(bundle: ContentBundle) -> None:
    data = _first(bundle)
    data["steps"][0]["detections"] = ["no-such-rule"]
    data["attack_chain"][0]["technique"] = "T9999"
    messages = " ".join(i.message for i in checks.check_stories(_bundle_with(bundle, data)))
    assert "unknown rule" in messages and "unknown MITRE identifier T9999" in messages


def test_steps_may_not_go_backwards_in_time(bundle: ContentBundle) -> None:
    data = _first(bundle)
    data["steps"][1]["time"] = "07:00"
    issues = checks.check_stories(_bundle_with(bundle, data))
    assert any("go backwards" in i.message for i in issues)


def test_graph_edges_must_use_defined_nodes(bundle: ContentBundle) -> None:
    data = _first(bundle)
    data["steps"][0]["graph_edges"].append({"source": "ghost", "target": "host-dev", "relation": "executed"})
    issues = checks.check_stories(_bundle_with(bundle, data))
    assert any("ghost" in i.message for i in issues)


def test_schema_rejects_a_single_choice_question_without_one_correct_option(bundle: ContentBundle) -> None:
    data = _first(bundle)
    question = next(q for s in data["steps"] for q in s["questions"] if q["kind"] == "single")
    for option in question["options"]:
        option["correct"] = False
    with pytest.raises(ValidationError, match="exactly one correct"):
        StoryDoc.model_validate(data)


def test_schema_requires_a_best_decision_option_and_valid_clock_times(bundle: ContentBundle) -> None:
    data = _first(bundle)
    decision = next(s["decision"] for s in data["steps"] if s["decision"])
    for option in decision["options"]:
        option["quality"] = "poor"
    with pytest.raises(ValidationError, match="best"):
        StoryDoc.model_validate(data)
    data = _first(bundle)
    data["steps"][0]["time"] = "25:99"
    with pytest.raises(ValidationError, match="HH:MM"):
        StoryDoc.model_validate(data)


def test_unknown_keys_are_rejected(bundle: ContentBundle) -> None:
    data = _first(bundle)
    data["surprise"] = True
    with pytest.raises(ValidationError):
        StoryDoc.model_validate(data)


def test_cli_story_validate_passes_on_the_repository(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["story", "validate"]) == 0
    out = capsys.readouterr().out
    assert "5 stories checked, 0 errors" in out or "stories checked, 0 errors" in out


# --- API ----------------------------------------------------------------------------------------


def test_list_stories(client: TestClient) -> None:
    rows = client.get("/api/v1/stories").json()
    assert {r["slug"] for r in rows} >= REQUIRED_STORIES
    row = next(r for r in rows if r["slug"] == "compromised-developer-workstation")
    assert row["step_count"] == 6 and row["detection_count"] >= 6
    assert "T1078" in row["techniques"] and row["event_count"] > 8


def test_get_story_returns_timeline_evidence_detections_and_decisions(client: TestClient) -> None:
    story = client.get("/api/v1/stories/compromised-developer-workstation").json()
    assert story["briefing"] and story["attack_chain"][0]["technique_name"]
    first = story["steps"][0]
    assert first["time"] == "08:41" and first["events"][0]["raw"]
    assert first["evidence"] and first["questions"]
    det = first["detections"][0]
    assert det["slug"] == "win-rdp-logon-from-public-address" and det["declared"] is True
    assert det["level"] and det["events"]
    assert first["alert"]["severity"] == "high"
    assert [t["id"] for t in first["techniques"]] == ["T1078"]
    assert any(step["decision"] for step in story["steps"])
    assert story["containment"] and story["postmortem"]["lessons"]
    times = [s["time"] for s in story["steps"]]
    assert times == sorted(times)


def test_correlation_hits_land_on_the_step_that_completes_them(client: TestClient) -> None:
    story = client.get("/api/v1/stories/credential-abuse-and-lateral-movement").json()
    spray = next(s for s in story["steps"] if s["id"] == "spray")
    hit = next(d for d in spray["detections"] if d["slug"] == "win-password-spraying-pattern")
    assert hit["is_correlation"] and len(hit["events"]) >= 8
    backdoor = next(s for s in story["steps"] if s["id"] == "backdoor-admin")
    assert any(d["slug"] == "win-local-admin-account-created" for d in backdoor["detections"])


def test_story_graph_fragments_reference_their_own_nodes(client: TestClient) -> None:
    story = client.get("/api/v1/stories/web-application-intrusion").json()
    known: set[str] = set()
    for step in story["steps"]:
        known |= {n["id"] for n in step["graph"]["nodes"]}
        for edge in step["graph"]["edges"]:
            assert edge["source"] in known and edge["target"] in known
    kinds = {n["type"] for s in story["steps"] for n in s["graph"]["nodes"]}
    assert {"ip", "host", "detection", "alert", "technique", "process"} <= kinds


def test_unknown_story_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/stories/nope").status_code == 404
