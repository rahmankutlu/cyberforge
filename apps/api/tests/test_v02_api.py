"""v0.2 API surface: rule tests, quality, playground, stories, demo."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_quality_reports_coverage_from_the_repository(client: TestClient) -> None:
    body = client.get("/api/v1/detections/quality").json()
    cov = body["coverage"]
    assert cov["rules"] == cov["tested"] >= 56
    assert cov["percent"] == 100 and cov["failing"] == 0
    assert body["checks_total"] == 7 * cov["rules"]
    rule = next(r for r in body["rules"] if r["slug"] == "win-encoded-powershell-command")
    assert rule["passed"] == rule["total"] == 7
    assert {c["id"] for c in rule["checks"]} >= {"has_positive_tests", "translation_verified"}


def test_rule_tests_endpoint_returns_cases_and_source(client: TestClient) -> None:
    body = client.get("/api/v1/detections/win-encoded-powershell-command/tests").json()
    assert body["tests_path"].endswith("win-encoded-powershell-command.tests.yml")
    assert "detects encoded PowerShell" in body["source"]
    assert body["cases"] and all(c["passed"] for c in body["cases"])
    assert any(not c["expected"] for c in body["cases"])


def test_rule_tests_unknown_rule_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/detections/no-such-rule/tests").status_code == 404


def test_quality_route_does_not_shadow_rule_slugs(client: TestClient) -> None:
    assert client.get("/api/v1/detections/win-encoded-powershell-command").status_code == 200


# --- MITRE coverage from content ------------------------------------------------------------------


def test_matrix_reports_story_and_test_coverage(client: TestClient) -> None:
    body = client.get("/api/v1/mitre/matrix").json()
    totals = body["totals"]
    assert totals["with_stories"] >= 10 and totals["with_tested_rules"] >= 20
    assert 0 <= totals["lacking_tests"] < totals["techniques"]
    cells = {t["id"]: t for col in body["columns"] for t in col["techniques"]}
    ps = cells["T1059.001"]
    assert ps["stories"] >= 1 and ps["tested_rules"] >= 3 and ps["lacking_tests"] is False
    assert "Windows" in ps["domains"]


def test_techniques_can_be_filtered_by_domain(client: TestClient) -> None:
    def ids(domain: str) -> set[str]:
        rows = client.get("/api/v1/mitre/techniques", params={"domain": domain}).json()
        assert rows and all(domain in r["domains"] for r in rows)
        return {r["id"] for r in rows}

    windows, web, cloud = ids("Windows"), ids("Web"), ids("Cloud")
    assert "T1059.001" in windows and "T1190" in web and "T1078.004" in cloud
    assert "T1059.001" not in web
    assert client.get("/api/v1/mitre/techniques", params={"domain": "Mainframe"}).status_code == 422
    ai = client.get("/api/v1/mitre/techniques", params={"domain": "AI Security", "framework": "atlas"}).json()
    assert ai and all(r["framework"] == "atlas" for r in ai)


def test_matrix_domain_filter_narrows_the_columns(client: TestClient) -> None:
    everything = client.get("/api/v1/mitre/matrix").json()["totals"]["techniques"]
    web = client.get("/api/v1/mitre/matrix", params={"domain": "Web"}).json()["totals"]["techniques"]
    assert 0 < web < everything


def test_techniques_lacking_tests_are_those_covered_only_by_untested_content(client: TestClient) -> None:
    rows = client.get("/api/v1/mitre/techniques", params={"lacking_tests": True}).json()
    assert all(r["lacking_tests"] and r["tested_rules"] == 0 for r in rows)
    assert all(r["labs"] or r["rules"] or r["stories"] for r in rows)
    everything = client.get("/api/v1/mitre/techniques").json()
    assert len(rows) == sum(1 for r in everything if r["lacking_tests"])


def test_technique_detail_carries_the_new_fields(client: TestClient) -> None:
    detail = client.get("/api/v1/mitre/techniques/T1003.001").json()
    assert detail["stories"] >= 2 and detail["tested_rules"] >= 2 and "Windows" in detail["domains"]
