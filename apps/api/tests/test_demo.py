"""Demo mode: the derived script, the scenario checks and the live SSE stream."""

from __future__ import annotations

import json

import pytest
from fastapi.testclient import TestClient

from cyberforge.content import checks
from cyberforge.content.demos import DemoScenario
from cyberforge.content.loader import ContentBundle
from cyberforge.services import demo as demo_service

SLUG = "suspicious-powershell-to-credential-access"


def _script(bundle: ContentBundle) -> dict:
    return demo_service.build_script(next(d for d in bundle.demos if d.slug == SLUG), bundle)


def test_the_default_demo_is_valid(bundle: ContentBundle) -> None:
    assert SLUG in {d.slug for d in bundle.demos}
    assert checks.check_demos(bundle) == []


def test_script_is_deterministic(bundle: ContentBundle) -> None:
    assert json.dumps(_script(bundle), sort_keys=True) == json.dumps(_script(bundle), sort_keys=True)


def test_script_tells_the_promised_story(bundle: ContentBundle) -> None:
    s = _script(bundle)
    assert 60 <= s["duration_seconds"] <= 90
    rules = [a["rule"] for a in s["alerts"]]
    assert rules[:2] == ["win-office-application-spawns-shell", "win-encoded-powershell-command"]
    assert "win-lsass-memory-dump-command-line" in rules and "win-run-key-persistence-set" in rules
    assert [a["t"] for a in s["alerts"]] == sorted(a["t"] for a in s["alerts"])
    assert len({a["id"] for a in s["alerts"]}) == len(s["alerts"])
    # an alert follows its event, never precedes it
    events = {e["id"]: e for e in s["events"]}
    assert all(a["t"] > events[a["event_id"]]["t"] for a in s["alerts"])


def test_severity_escalates_and_never_drops(bundle: ContentBundle) -> None:
    timeline = _script(bundle)["severity_timeline"]
    order = ["informational", "low", "medium", "high", "critical"]
    ranks = [order.index(p["severity"]) for p in timeline]
    assert ranks == sorted(ranks) and ranks[-1] == order.index("critical")
    assert len(timeline) >= 3  # visible transitions, not a single jump


def test_mitre_techniques_carry_tactics_and_first_seen_time(bundle: ContentBundle) -> None:
    s = _script(bundle)
    ids = {t["id"] for t in s["techniques"]}
    assert {"T1059.001", "T1003.001", "T1547.001"} <= ids
    assert all(t["tactics"] and t["t"] > 0 for t in s["techniques"])
    assert len(s["tactics"]) == 15


def test_process_chain_links_word_to_the_credential_dump(bundle: ContentBundle) -> None:
    tree = _script(bundle)["process_tree"]
    labels = {n["id"]: n["label"] for n in tree["nodes"]}
    edges = {(labels[e["source"]], labels[e["target"]]) for e in tree["edges"]}
    assert ("WINWORD.EXE", "cmd.exe") in edges and ("cmd.exe", "powershell.exe") in edges
    assert ("powershell.exe", "rundll32.exe") in edges and ("rundll32.exe", "lsass.exe") in edges
    in_chain = {n["label"] for n in tree["nodes"] if n["in_chain"]}
    assert "lsass.exe" in in_chain and "chrome.exe" not in in_chain


def test_summary_is_derived_from_the_data(bundle: ContentBundle) -> None:
    s = _script(bundle)
    summary = s["incident_summary"]
    stats = summary["stats"]
    assert stats["alerts"] == len(s["alerts"]) and stats["events"] == len(s["events"])
    assert stats["techniques"] == len(s["techniques"])
    assert stats["peak_severity"] == "critical" and stats["seconds_to_containment"] > 0
    assert str(len(s["alerts"])) in summary["headline"]
    assert summary["t"] < s["duration_seconds"] and summary["t"] > max(e["t"] for e in s["events"])


def test_containment_and_notes_are_scheduled_within_the_demo(bundle: ContentBundle) -> None:
    s = _script(bundle)
    assert s["containment"][0]["state"] == "monitoring" and s["containment"][0]["t"] == 0
    assert s["containment"][-1]["state"] == "contained"
    assert all(n["t"] < s["duration_seconds"] for n in s["notes"])


def test_scenario_checks_reject_a_broken_scenario(bundle: ContentBundle) -> None:
    import copy

    data = next(d for d in bundle.demos if d.slug == SLUG).model_dump()
    data["events"][-1]["t"] = 200  # beyond the duration
    data["events"][0]["fields"]["dst_ip"] = "8.8.8.8"
    clone = copy.copy(bundle)
    clone.demos = [DemoScenario.model_validate(data)]
    messages = " ".join(i.message for i in checks.check_demos(clone))
    assert "at least 8 seconds" in messages and "non-synthetic" in messages


# --- API ----------------------------------------------------------------------------------------


def test_scenarios_endpoints(client: TestClient) -> None:
    rows = client.get("/api/v1/demo/scenarios").json()
    assert SLUG in {r["slug"] for r in rows}
    script = client.get(f"/api/v1/demo/scenarios/{SLUG}").json()
    assert script["alerts"] and script["events"] and script["incident_summary"]["headline"]
    assert client.get("/api/v1/demo/scenarios/nope").status_code == 404


def _sse_messages(client: TestClient, url: str, count: int) -> list[dict]:
    messages: list[dict] = []
    with client.stream("GET", url) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert "no-transform" in response.headers["cache-control"]
        data = ""
        for line in response.iter_lines():
            if line.startswith("data: "):
                data = line[6:]
            elif line == "" and data:
                messages.append(json.loads(data))
                data = ""
                if len(messages) >= count:
                    break
    return messages


def test_event_stream_emits_documented_fields(client: TestClient) -> None:
    messages = _sse_messages(client, "/api/v1/stream/events?rate=20&limit=6", 4)
    assert len(messages) == 4
    for m in messages:
        assert {"timestamp", "source", "host", "event_type", "severity", "message", "seq"} <= m.keys()
        assert "rule" in m
    assert [m["seq"] for m in messages] == sorted(m["seq"] for m in messages)


def test_event_stream_mixes_ordinary_traffic_and_matches(client: TestClient) -> None:
    messages = _sse_messages(client, "/api/v1/stream/events?rate=20&limit=60&offset=3", 40)
    assert any(m["rule"] for m in messages) and any(m["rule"] is None for m in messages)
    assert {m["severity"] for m in messages} & {"high", "critical", "medium"}


def test_event_stream_validates_its_parameters(client: TestClient) -> None:
    assert client.get("/api/v1/stream/events?rate=0").status_code == 422
    assert client.get("/api/v1/stream/events?limit=0").status_code == 422
    assert client.get("/api/v1/stream/events?rate=999").status_code == 422


def test_event_stream_limits_concurrent_connections(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from cyberforge.api.v1 import showcase

    monkeypatch.setattr(showcase, "_active", showcase.MAX_STREAMS)
    assert client.get("/api/v1/stream/events?limit=1").status_code == 429
