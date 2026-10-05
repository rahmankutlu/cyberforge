"""Processing pipelines: field mapping per SIEM, honest fallbacks and the field-change report."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from cyberforge.services import sigma_pipelines, sigma_service

SIGMA = Path(__file__).resolve().parents[3] / "detections" / "sigma"


def rule(name: str) -> str:
    return next(SIGMA.rglob(f"{name}.yml")).read_text(encoding="utf-8")


def one(text: str, target: str, selection: str) -> sigma_service.Translation:
    return sigma_service.translate(text, [target], {target: selection})[0]


def test_pipelines_are_off_unless_requested() -> None:
    plain = sigma_service.translate(rule("win-encoded-powershell-command"), ["elastic"])[0]
    assert plain.pipeline is None and not plain.field_changes
    assert "CommandLine" in plain.queries[0]


def test_ecs_pipeline_renames_fields_and_reports_what_it_did() -> None:
    result = one(rule("win-encoded-powershell-command"), "elastic", "auto")
    assert result.pipeline == "ecs_windows" and result.pipeline_label == "ECS (Windows)"
    assert "process.command_line" in result.queries[0] and "CommandLine" not in result.queries[0]
    changes = {c.source: c.targets for c in result.field_changes}
    assert changes["CommandLine"] == ("process.command_line",)
    assert all(c.changed for c in result.field_changes)


def test_pipeline_additions_are_reported_not_hidden() -> None:
    result = one(rule("win-admin-share-access-from-workstation"), "elastic", "ecs_windows")
    assert "winlog.channel" in result.added_fields
    assert not result.dropped_fields


def test_one_field_that_maps_to_several_is_paired_by_position() -> None:
    result = one(rule("win-office-application-spawns-shell"), "sentinel", "sentinel_asim")
    changes = {c.source: c.targets for c in result.field_changes}
    assert changes["ParentImage"] == ("ParentProcessName", "ActingProcessName")
    assert changes["Image"] == ("TargetProcessName",)
    assert result.queries[0].startswith("imProcessCreate")


def test_auto_tries_the_next_pipeline_when_one_rejects_the_rule() -> None:
    # ASIM has no TargetProcessFilename, so "auto" moves on to the Defender XDR tables.
    result = one(rule("win-encoded-powershell-command"), "sentinel", "auto")
    assert result.pipeline == "microsoft_xdr"
    assert "ProcessCommandLine" in result.queries[0]


def test_a_pipeline_that_only_chooses_the_table_still_counts() -> None:
    result = one(rule("win-admin-share-access-from-workstation"), "sentinel", "auto")
    assert result.pipeline == "azure_monitor"
    assert result.queries[0].startswith("SecurityEvent")


def test_a_pipeline_that_refuses_the_rule_falls_back_to_the_unmapped_query() -> None:
    result = one(rule("win-admin-share-access-from-workstation"), "sentinel", "sentinel_asim")
    assert result.pipeline is None and not result.error
    assert result.pipeline_error and "ShareName" in result.pipeline_error
    assert "\n" not in result.pipeline_error and len(result.pipeline_error) <= 300
    assert "ShareName" in result.queries[0]


def test_a_log_source_without_a_pipeline_says_so() -> None:
    result = one(rule("linux-shell-network-redirect-pattern"), "elastic", "auto")
    assert result.pipeline is None and not result.pipeline_error
    assert "No ECS (Windows) pipeline" in result.notes[0] and "linux" in result.notes[0]


def test_every_pipeline_gets_a_fresh_rule() -> None:
    # pySigma rewrites rules in place; reusing a parsed rule would hand the second target an
    # already-renamed one.
    text = rule("win-encoded-powershell-command")
    both = sigma_service.translate(
        text, ["elastic", "opensearch"], {"elastic": "auto", "opensearch": "auto"}
    )
    assert [t.pipeline for t in both] == ["ecs_windows", "ecs_windows"]
    assert both[0].queries == both[1].queries


def test_unsupported_rule_types_still_report_the_backend_error() -> None:
    result = one(rule("win-failed-logon-burst"), "elastic", "auto")
    assert result.error and "correlation" in result.error.lower()
    assert not result.queries


def test_unknown_targets_and_pipelines_are_rejected() -> None:
    text = rule("win-encoded-powershell-command")
    with pytest.raises(ValueError, match="Unknown pipeline 'nope'"):
        sigma_service.translate(text, ["elastic"], {"elastic": "nope"})
    with pytest.raises(ValueError, match="Unknown pipeline 'ecs_windows'"):
        sigma_service.translate(text, ["splunk"], {"splunk": "ecs_windows"})
    with pytest.raises(ValueError, match="Unknown translation target"):
        sigma_service.translate(text, ["elastic"], {"nope": "auto"})


def test_the_catalogue_matches_what_auto_tries() -> None:
    for target, order in sigma_pipelines.AUTO_ORDER.items():
        ids = {spec.id for spec in sigma_pipelines.pipelines_for(target)}
        assert set(order) <= ids, target
    assert [s.id for s in sigma_pipelines.pipelines_for("splunk")] == [
        "splunk_windows",
        "splunk_cim",
    ]
    assert "splunk_cim" not in sigma_pipelines.AUTO_ORDER["splunk"]


def test_api_lists_the_pipelines(client: TestClient) -> None:
    catalogue = client.get("/api/v1/detections/translate/pipelines").json()
    assert set(catalogue) == {"elastic", "opensearch", "splunk", "sentinel"}
    by_id = {p["id"]: p for p in catalogue["splunk"]}
    assert by_id["splunk_windows"]["auto"] is True and by_id["splunk_cim"]["auto"] is False
    assert all(p["label"] and p["description"] for items in catalogue.values() for p in items)


def test_api_translates_with_pipelines_and_defaults_to_none(client: TestClient) -> None:
    content = client.get("/api/v1/detections/win-encoded-powershell-command").json()["content"]
    plain = client.post(
        "/api/v1/detections/translate", json={"content": content, "targets": ["elastic"]}
    ).json()["translations"][0]
    assert plain["pipeline"] is None and plain["field_changes"] == []

    mapped = client.post(
        "/api/v1/detections/translate",
        json={"content": content, "targets": ["elastic"], "pipelines": {"elastic": "auto"}},
    ).json()["translations"][0]
    assert mapped["pipeline"] == "ecs_windows"
    assert {
        "source": "CommandLine",
        "targets": ["process.command_line"],
        "changed": True,
    } in mapped["field_changes"]


def test_api_rejects_an_unknown_pipeline(client: TestClient) -> None:
    content = client.get("/api/v1/detections/win-encoded-powershell-command").json()["content"]
    response = client.post(
        "/api/v1/detections/translate",
        json={"content": content, "pipelines": {"elastic": "nope"}},
    )
    assert response.status_code == 422 and "nope" in response.json()["detail"]
    bad_target = client.post(
        "/api/v1/detections/translate", json={"content": content, "pipelines": {"nope": "auto"}}
    )
    assert bad_target.status_code == 422
