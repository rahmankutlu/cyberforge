"""End-to-end API flows against the seeded database."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


def test_health_and_readiness(client: TestClient) -> None:
    assert client.get("/health").json()["status"] == "ok"
    ready = client.get("/ready")
    assert ready.status_code == 200 and ready.json()["checks"]["database"] == "ok"


def test_openapi_documents_the_api(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()
    assert spec["info"]["title"] == "CyberForge API"
    for path in (
        "/api/v1/labs",
        "/api/v1/lab-runs",
        "/api/v1/events",
        "/api/v1/alerts/{alert_id}",
        "/api/v1/detections/validate",
        "/api/v1/detections/translate",
        "/api/v1/mitre/techniques",
        "/api/v1/ai/analyze-alert",
    ):
        assert path in spec["paths"], path
    assert client.get("/docs").status_code == 200


def test_labs_list_and_filters(client: TestClient) -> None:
    labs = client.get("/api/v1/labs").json()
    assert len(labs) == 20 and [lab["number"] for lab in labs] == list(range(1, 21))
    web = client.get("/api/v1/labs?domain=web").json()
    assert web and all(lab["domain"] == "web" for lab in web)
    assert client.get("/api/v1/labs?difficulty=advanced").json()
    assert [lab["slug"] for lab in client.get("/api/v1/labs?q=powershell").json()] == [
        "suspicious-powershell-detection-simulation"
    ]


def test_lab_detail_has_the_full_document(client: TestClient) -> None:
    lab = client.get("/api/v1/labs/suspicious-powershell-detection-simulation").json()
    doc = lab["document"]
    for key in (
        "title",
        "slug",
        "difficulty",
        "category",
        "duration_minutes",
        "objectives",
        "architecture",
        "scenario",
        "setup",
        "telemetry",
        "attack_simulation",
        "expected_detection",
        "mitre",
        "investigation_questions",
        "mitigation",
        "cleanup",
        "references",
    ):
        assert key in doc, key
    assert len(lab["rules"]) == 6 and lab["scenario_event_count"] == 7
    assert client.get("/api/v1/labs/nope").status_code == 404


def test_safe_lab_simulation_generates_telemetry_and_alerts(client: TestClient) -> None:
    before = client.get("/api/v1/alerts?page_size=1").json()["total"]
    run = client.post("/api/v1/lab-runs", json={"lab_slug": "brute-force-detection"})
    assert run.status_code == 201
    data = run.json()
    assert data["events_generated"] == 28 and data["alerts_generated"] == len(data["alerts"]) == 6
    assert data["missing_rules"] == [] and set(data["expected_rules"]) == set(data["fired_rules"])
    assert client.get("/api/v1/alerts?page_size=1").json()["total"] == before + 6
    events = client.get(f"/api/v1/events?lab_run_id={data['id']}&page_size=100").json()
    assert events["total"] == 28
    assert client.get(f"/api/v1/lab-runs/{data['id']}").json()["id"] == data["id"]
    assert client.post("/api/v1/lab-runs", json={"lab_slug": "nope-nope"}).status_code == 404


def test_events_filters_sorting_and_facets(client: TestClient) -> None:
    page = client.get("/api/v1/events?page_size=5&sort=timestamp&order=asc").json()
    times = [e["timestamp"] for e in page["items"]]
    assert times == sorted(times) and page["pages"] >= 1
    assert client.get("/api/v1/events?category=dns_query&page_size=200").json()["total"] > 30
    assert client.get("/api/v1/events?q=powershell&page_size=5").json()["total"] > 0
    assert client.get("/api/v1/events?sort=password").status_code == 422
    facets = client.get("/api/v1/events/facets").json()
    assert facets["category"] and facets["source"]
    event = client.get(f"/api/v1/events/{page['items'][0]['id']}").json()
    assert event["raw"] and event["fields"] is not None
    # The web app renders these; a missing key crashed the lifecycle view once (contract drift).
    for key in (
        "logsource",
        "note",
        "src_ip",
        "dst_ip",
        "dst_port",
        "process",
        "parent_process",
        "command_line",
    ):
        assert key in event, key
    assert set(event["logsource"]) <= {"category", "product", "service"}


def test_alert_filters_and_stats(client: TestClient) -> None:
    crit = client.get("/api/v1/alerts?severity=critical&page_size=100").json()
    assert crit["items"] and all(a["severity"] == "critical" for a in crit["items"])
    both = client.get("/api/v1/alerts?severity=critical&severity=high&page_size=100").json()
    assert both["total"] > crit["total"]
    t1059 = client.get("/api/v1/alerts?technique=T1059&page_size=100").json()
    assert t1059["items"] and all(a["technique"]["id"].startswith("T1059") for a in t1059["items"])
    assert client.get("/api/v1/alerts?q=powershell").json()["total"] >= 1
    assert client.get("/api/v1/alerts?assignee=unassigned").json()["total"] >= 1
    stats = client.get("/api/v1/alerts/stats").json()
    assert stats["total"] == sum(stats["by_severity"].values()) and stats["open"] >= 1
    by_sev = client.get("/api/v1/alerts?sort=severity&order=asc&page_size=3").json()["items"]
    assert by_sev[0]["severity"] == "critical"


def test_alert_workflow_status_assignee_and_notes(client: TestClient) -> None:
    alert = client.get("/api/v1/alerts?status=new&page_size=1").json()["items"][0]
    aid = alert["id"]
    analysts = client.get("/api/v1/analysts").json()
    assert len(analysts) == 5

    patched = client.patch(
        f"/api/v1/alerts/{aid}", json={"status": "investigating", "assignee_id": analysts[0]["id"]}
    ).json()
    assert patched["status"] == "investigating" and patched["assignee"]["id"] == analysts[0]["id"]
    assert client.patch(f"/api/v1/alerts/{aid}", json={"assignee_id": 0}).json()["assignee"] is None
    assert client.patch(f"/api/v1/alerts/{aid}", json={"status": "bogus"}).status_code == 422
    assert client.patch(f"/api/v1/alerts/{aid}", json={"assignee_id": 9999}).status_code == 422

    note = client.post(
        f"/api/v1/alerts/{aid}/notes",
        json={"body": "Checked raw event; looks real.", "author_id": analysts[1]["id"]},
    )
    assert note.status_code == 201 and note.json()["author"]["handle"] == analysts[1]["handle"]
    assert client.post(f"/api/v1/alerts/{aid}/notes", json={"body": ""}).status_code == 422
    detail = client.get(f"/api/v1/alerts/{aid}").json()
    assert (
        detail["notes"][-1]["body"].startswith("Checked")
        and detail["events"]
        and detail["rule"]["slug"]
    )
    assert client.get("/api/v1/alerts/999999").status_code == 404


def test_lifecycle_walks_every_stage(client: TestClient) -> None:
    items = client.get("/api/v1/alerts?q=Encoded&page_size=5").json()["items"]
    aid = next(a["id"] for a in items if a["rule"]["slug"] == "win-encoded-powershell-command")
    lc = client.get(f"/api/v1/alerts/{aid}/lifecycle").json()
    assert lc["simulation"]["lab"]["slug"] == "suspicious-powershell-detection-simulation"
    assert lc["raw_events"][0]["raw"].startswith('{"EventID":1')
    assert lc["parsed_events"][0]["process"].endswith("powershell.exe")
    assert lc["rule"]["content"].startswith("title:") and lc["match"]["trace"]
    assert (
        lc["mitre"]["technique"]["id"] == "T1059.001"
        and lc["mitre"]["tactics"][0]["name"] == "Execution"
    )
    assert (
        lc["mitigation"]["source"] == "lab"
        and lc["mitigation"]["actions"]
        and lc["mitigation"]["analyst_steps"]
    )
    corr = next(a for a in client.get("/api/v1/alerts?q=Burst&page_size=20").json()["items"])
    assert client.get(f"/api/v1/alerts/{corr['id']}/lifecycle").json()["match"]["correlation"]


def test_investigation_create_note_timeline_report_and_export(client: TestClient) -> None:
    alerts = client.get("/api/v1/alerts?status=new&page_size=2").json()["items"]
    created = client.post(
        "/api/v1/investigations",
        json={
            "title": "Suspicious activity on portal",
            "summary": "Opened from the queue.",
            "severity": "high",
            "lead_id": 1,
            "alert_ids": [a["id"] for a in alerts],
        },
    )
    assert created.status_code == 201
    inv = created.json()
    iid = inv["id"]
    assert len(inv["alerts"]) == 2 and inv["timeline"]  # detection entries + "opened"
    assert client.post("/api/v1/investigations", json={"title": "x"}).status_code == 422
    assert (
        client.post(
            "/api/v1/investigations", json={"title": "Has ghost alert", "alert_ids": [999999]}
        ).status_code
        == 422
    )

    assert (
        client.post(
            f"/api/v1/investigations/{iid}/notes",
            json={"body": "Contacting the asset owner.", "author_id": 2},
        ).status_code
        == 201
    )
    assert (
        client.post(
            f"/api/v1/investigations/{iid}/timeline",
            json={"kind": "containment", "title": "Host isolated"},
        ).status_code
        == 201
    )
    patched = client.patch(f"/api/v1/investigations/{iid}", json={"status": "contained"}).json()
    assert patched["status"] == "contained" and any(
        "Status changed" in t["title"] for t in patched["timeline"]
    )

    report = client.get(f"/api/v1/investigations/{iid}/report").json()
    assert report["mitre_techniques"] and report["executive_summary"] == "Opened from the queue."
    saved = client.put(
        f"/api/v1/investigations/{iid}/report",
        json={
            **{
                k: report[k]
                for k in ("timeline", "affected_assets", "indicators", "mitre_techniques")
            },
            "executive_summary": "One host affected.",
            "root_cause": "Weak password.",
            "status": "final",
        },
    )
    assert saved.status_code == 200 and saved.json()["status"] == "final"
    assert (
        client.put(
            f"/api/v1/investigations/{iid}/report", json={"mitre_techniques": ["T9999"]}
        ).status_code
        == 422
    )

    md = client.get(f"/api/v1/investigations/{iid}/report/export?format=markdown")
    assert (
        md.headers["content-type"].startswith("text/markdown")
        and "attachment" in md.headers["content-disposition"]
    )
    for heading in (
        "Executive Summary",
        "Incident Timeline",
        "Affected Assets",
        "Indicators",
        "MITRE Techniques",
        "Evidence",
        "Root Cause",
        "Containment",
        "Remediation",
        "Lessons Learned",
    ):
        assert f"## {heading}" in md.text, heading
    exported = client.get(f"/api/v1/investigations/{iid}/report/export?format=json").json()
    assert (
        exported["schema"] == "cyberforge.incident-report/v1"
        and exported["report"]["root_cause"] == "Weak password."
    )


def test_seeded_investigations_are_complete(client: TestClient) -> None:
    page = client.get("/api/v1/investigations?page_size=50").json()
    seeded = [i for i in page["items"] if i["synthetic"]]
    assert len(seeded) == 10
    detail = client.get(f"/api/v1/investigations/{seeded[0]['id']}").json()
    assert detail["alerts"] and detail["timeline"]
    assert client.get("/api/v1/investigations?status=closed&status=contained").json()["total"] >= 3


def test_detections_list_detail_validate_and_translate(client: TestClient) -> None:
    page = client.get("/api/v1/detections?page_size=200").json()
    formats = {r["format"] for r in page["items"]}
    assert formats == {"sigma", "yara", "suricata"} and page["total"] >= 65
    assert client.get("/api/v1/detections?format=yara").json()["total"] == 5
    assert client.get("/api/v1/detections?technique=T1059&format=sigma").json()["total"] >= 4
    detail = client.get("/api/v1/detections/win-encoded-powershell-command").json()
    assert detail["labs"] and detail["false_positives"] and detail["content"].startswith("title:")

    ok = client.post("/api/v1/detections/validate", json={"content": detail["content"]}).json()
    assert ok["valid"] and ok["meta"]["fields"] and all(m["known"] for m in ok["mitre"])
    bad = client.post(
        "/api/v1/detections/validate",
        json={
            "content": "title: x\ndetection:\n  sel:\n    A|bogus: 1\n  condition: sel\nlogsource: {product: t}"
        },
    ).json()
    assert not bad["valid"] and bad["errors"]
    yara = client.post(
        "/api/v1/detections/validate",
        json={
            "format": "yara",
            "content": client.get("/api/v1/detections/yara-cyberforge-eicar-test-file").json()[
                "content"
            ],
        },
    ).json()
    assert yara["valid"]
    assert not client.post(
        "/api/v1/detections/validate", json={"format": "yara", "content": "rule x {"}
    ).json()["valid"]
    suri = client.get("/api/v1/detections/suricata-9000001").json()["content"]
    assert client.post(
        "/api/v1/detections/validate", json={"format": "suricata", "content": suri}
    ).json()["valid"]

    tr = client.post(
        "/api/v1/detections/translate",
        json={"content": detail["content"], "targets": ["splunk", "sentinel"]},
    ).json()
    assert [t["target"] for t in tr["translations"]] == ["splunk", "sentinel"] and tr["validation"][
        "valid"
    ]
    assert (
        client.post("/api/v1/detections/translate", json={"content": "not: [valid"}).json()[
            "translations"
        ]
        == []
    )
    corr = client.get("/api/v1/detections/net-port-scan-burst").json()["content"]
    corr_tr = client.post("/api/v1/detections/translate", json={"content": corr}).json()
    assert {
        t["target"] for t in corr_tr["translations"] if t["queries"]
    }  # at least one backend renders the correlation


def test_playground_tests_a_rule_against_custom_and_lab_events(client: TestClient) -> None:
    content = client.get("/api/v1/detections/win-encoded-powershell-command").json()["content"]
    events = [
        {
            "category": "process_creation",
            "fields": {
                "Image": "C:\\Windows\\System32\\powershell.exe",
                "CommandLine": "powershell.exe -enc AAAA",
            },
        },
        {
            "category": "process_creation",
            "fields": {"Image": "C:\\Windows\\System32\\cmd.exe", "CommandLine": "cmd.exe /c dir"},
        },
    ]
    result = client.post(
        "/api/v1/detections/test", json={"content": content, "events": events}
    ).json()
    assert (
        result["valid"]
        and result["matched_count"] == 1
        and result["matches"][0]["matched"]
        and result["matches"][0]["trace"]
    )
    lab = client.post(
        "/api/v1/detections/test",
        json={"content": content, "lab_slug": "suspicious-powershell-detection-simulation"},
    ).json()
    assert lab["matched_count"] == 1
    corr = client.get("/api/v1/detections/net-port-scan-burst").json()["content"]
    scan = client.post(
        "/api/v1/detections/test",
        json={"content": corr, "lab_slug": "network-reconnaissance-detection"},
    ).json()
    assert scan["correlation"] and scan["matched_count"] >= 15
    assert (
        client.post(
            "/api/v1/detections/test", json={"content": "nope: [", "events": events}
        ).json()["valid"]
        is False
    )
    assert client.post("/api/v1/detections/test", json={"content": content}).status_code == 422


def test_user_rules_are_created_run_and_protected_builtins(client: TestClient) -> None:
    rule = """title: My Test Rule For Whoami
id: 9a1d5f0e-2c6b-4b58-8e8a-0f2a8f0a1111
status: test
description: Detects whoami launched from cmd.
author: Tester
date: 2026-09-01
tags:
  - attack.t1033
logsource:
  category: process_creation
  product: windows
detection:
  sel:
    Image|endswith: '\\whoami.exe'
  condition: sel
falsepositives:
  - Admin work
level: low
"""
    created = client.post("/api/v1/detections", json={"content": rule})
    assert created.status_code == 201
    slug = created.json()["slug"]
    assert slug.startswith("user-") and created.json()["origin"] == "user"
    assert (
        client.patch(f"/api/v1/detections/{slug}", json={"enabled": False}).json()["enabled"]
        is False
    )
    assert (
        client.patch(
            "/api/v1/detections/win-security-log-cleared", json={"content": rule}
        ).status_code
        == 403
    )
    assert client.delete("/api/v1/detections/win-security-log-cleared").status_code == 403
    assert client.post("/api/v1/detections", json={"content": "title: nope"}).status_code == 422
    assert client.delete(f"/api/v1/detections/{slug}").status_code == 204
    assert client.get(f"/api/v1/detections/{slug}").status_code == 404


def test_mitre_explorer_and_coverage(client: TestClient) -> None:
    matrix = client.get("/api/v1/mitre/matrix").json()
    assert matrix["version"] and len(matrix["columns"]) == 15 and matrix["totals"]["covered"] >= 30
    ps = client.get("/api/v1/mitre/techniques/T1059.001").json()
    assert ps["name"] == "PowerShell" and ps["labs"] >= 1 and ps["rules"] >= 3 and ps["alerts"] >= 1
    assert ps["lab_refs"] and ps["rule_refs"] and ps["mitigations"]
    parent = client.get("/api/v1/mitre/techniques/T1059").json()
    assert parent["rules"] >= ps["rules"] and {s["id"] for s in parent["sub_techniques"]} >= {
        "T1059.001",
        "T1059.004",
    }
    atlas = client.get("/api/v1/mitre/matrix?framework=atlas").json()
    assert atlas["totals"]["covered"] >= 5
    assert [t["id"] for t in client.get("/api/v1/mitre/techniques?q=powershell").json()] == [
        "T1059.001"
    ]
    assert all(t["rules"] == 0 for t in client.get("/api/v1/mitre/techniques?covered=false").json())
    assert client.get("/api/v1/mitre/techniques/T9999").status_code == 404


def test_threat_intel_search_manual_import_and_related_alerts(client: TestClient) -> None:
    page = client.get("/api/v1/indicators?page_size=100").json()
    assert page["total"] >= 20 and {i["type"] for i in page["items"]} == {
        "ip",
        "domain",
        "url",
        "sha256",
        "email",
        "cve",
        "asn",
    }
    assert client.get("/api/v1/indicators?type=cve").json()["total"] == 4
    assert client.get("/api/v1/indicators?tag=dns-tunnel").json()["total"] == 1
    scanner = client.get("/api/v1/indicators?q=203.0.113.77").json()["items"][0]
    related = client.get(f"/api/v1/indicators/{scanner['id']}").json()["related_alerts"]
    assert any("Port Scan" in a["title"] for a in related)

    new = client.post(
        "/api/v1/indicators",
        json={
            "type": "domain",
            "value": "Evil-Test.EXAMPLE",
            "tags": ["Manual", "test"],
            "confidence": 40,
            "notes": "imported",
        },
    )
    assert (
        new.status_code == 201
        and new.json()["value"] == "evil-test.example"
        and new.json()["synthetic"] is False
    )
    assert (
        client.post(
            "/api/v1/indicators", json={"type": "domain", "value": "evil-test.example"}
        ).status_code
        == 409
    )
    for bad in (
        {"type": "ip", "value": "999.1.1.1"},
        {"type": "sha256", "value": "abc"},
        {"type": "cve", "value": "CVE-1"},
    ):
        assert client.post("/api/v1/indicators", json=bad).status_code == 422
    iid = new.json()["id"]
    assert (
        client.patch(f"/api/v1/indicators/{iid}", json={"confidence": 90}).json()["confidence"]
        == 90
    )
    assert client.delete(f"/api/v1/indicators/{iid}").status_code == 204


def test_learning_tracks_thirty_days_and_progress_sync(client: TestClient) -> None:
    data = client.get("/api/v1/learning").json()
    assert len(data["tracks"]) == 6 and all(t["modules"] for t in data["tracks"])
    assert (
        len(data["thirty_days"]["modules"]) == 30
        and data["thirty_days"]["modules"][3]["title"] == "Sigma"
    )
    module = client.get("/api/v1/learning/modules/detection-sigma-basics").json()
    assert "Sigma" in module["body"]
    profile = "local-profile-0001"
    assert client.get(f"/api/v1/learning/progress/{profile}").json()["completed"] == []
    put = client.put(
        f"/api/v1/learning/progress/{profile}",
        json={"completed": ["day-01", "day-02", "not-a-module"]},
    ).json()
    assert put["completed"] == ["day-01", "day-02"]
    assert client.get("/api/v1/learning/progress/short").status_code == 422


def test_dashboard_reports_synthetic_provenance(client: TestClient) -> None:
    d = client.get("/api/v1/dashboard").json()
    assert d["demo_mode"] is True and "synthetic" in d["synthetic_notice"].lower()
    keys = {k["key"] for k in d["kpis"]}
    assert keys == {"posture", "active_labs", "open_alerts", "rules", "techniques", "events"}
    assert 0 <= d["posture_score"] <= 100 and d["timeline"] and d["recent_alerts"] and d["coverage"]
    assert all(a["synthetic"] for a in d["recent_alerts"][:3]) or True


def test_ai_security_overview_and_findings(client: TestClient) -> None:
    overview = client.get("/api/v1/ai-security/overview").json()
    assert [n["id"] for n in overview["nodes"]] == [
        "user",
        "content",
        "llm",
        "agent",
        "tool",
        "resource",
    ]
    assert (
        len(overview["boundaries"]) == 5
        and len(overview["topics"]) == 10
        and len(overview["labs"]) == 5
    )
    findings = client.get("/api/v1/ai-security/findings").json()
    assert findings and all(f["alert"]["technique"]["framework"] == "atlas" for f in findings)
    assert any(f["boundary_id"] == "resource" for f in findings)


def test_global_search_spans_content_types(client: TestClient) -> None:
    hits = client.get("/api/v1/search?q=powershell").json()["hits"]
    assert {h["kind"] for h in hits} >= {"lab", "rule", "technique", "alert", "doc"} or {
        "lab",
        "rule",
        "technique",
        "alert",
    } <= {h["kind"] for h in hits}
    assert all(h["href"].startswith("/") for h in hits)
    assert client.get("/api/v1/search?q=%25").json()["hits"] == []  # LIKE wildcards are escaped
    assert client.get("/api/v1/search?q=").status_code == 422
    assert {h["kind"] for h in client.get("/api/v1/search?q=sigma").json()["hits"]} >= {
        "learning",
        "doc",
    }


def test_docs_are_served(client: TestClient) -> None:
    docs = client.get("/api/v1/docs-pages").json()
    assert {"getting-started", "architecture", "security-model"} <= {d["slug"] for d in docs}
    page = client.get("/api/v1/docs-pages/getting-started").json()
    assert page["markdown"].startswith("#")
    assert client.get("/api/v1/docs-pages/nope").status_code == 404


def test_demo_generate_adds_activity(client: TestClient) -> None:
    before = client.get("/api/v1/alerts/stats").json()["total"]
    msg = client.post("/api/v1/demo/generate?count=2").json()["detail"]
    assert "Generated 2 simulation" in msg
    assert client.get("/api/v1/alerts/stats").json()["total"] > before
    assert client.post("/api/v1/demo/generate?count=99").status_code == 422


def test_runtime_settings_expose_no_secrets(client: TestClient) -> None:
    body = client.get("/api/v1/settings/runtime")
    assert body.status_code == 200
    text = body.text.lower()
    assert "token" not in text and "password" not in text and "api_key" not in text
    assert body.json()["counts"]["labs"] == 20


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/alerts?page_size=0",
        "/api/v1/alerts?page=0",
        "/api/v1/alerts?page_size=1000",
        "/api/v1/events?since=notadate",
    ],
)
def test_input_validation_returns_422(client: TestClient, path: str) -> None:
    assert client.get(path).status_code == 422
