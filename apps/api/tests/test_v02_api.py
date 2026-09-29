"""v0.2 API surface: rule tests, quality, playground, stories, demo."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_quality_reports_coverage_from_the_repository(client: TestClient) -> None:
    body = client.get("/api/v1/detections/quality").json()
    cov = body["coverage"]
    assert cov["rules"] == cov["tested"] == 55
    assert cov["percent"] == 100 and cov["failing"] == 0
    assert body["checks_total"] == 7 * 55
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
