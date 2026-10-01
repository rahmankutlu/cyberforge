"""Global search over labs, stories, detections, datasets, MITRE, learning modules and docs."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from cyberforge.content.loader import ContentBundle
from cyberforge.services import search as search_service


def hits(client: TestClient, q: str) -> list[dict]:
    response = client.get("/api/v1/search", params={"q": q})
    assert response.status_code == 200
    return response.json()["hits"]


def kinds(found: list[dict]) -> set[str]:
    return {h["kind"] for h in found}


def test_powershell_finds_labs_stories_rules_datasets_techniques_and_docs(client: TestClient) -> None:
    found = hits(client, "powershell")
    assert {"lab", "story", "rule", "dataset", "technique", "doc"} <= kinds(found)
    assert any(h["kind"] == "dataset" and h["id"] == "suspicious-powershell-simulation" for h in found)
    assert any(h["kind"] == "story" and h["id"] == "compromised-developer-workstation" for h in found)


def test_a_technique_id_finds_everything_mapped_to_it(client: TestClient) -> None:
    found = hits(client, "T1059.001")
    assert any(h["kind"] == "technique" and h["id"] == "T1059.001" for h in found)
    assert any(h["kind"] == "rule" for h in found)
    assert any(h["kind"] == "story" for h in found)
    assert any(h["kind"] == "lab" for h in found)
    assert any(h["kind"] == "dataset" for h in found)


def test_lowercase_ids_and_parent_ids_work(client: TestClient) -> None:
    assert any(h["kind"] == "technique" and h["id"] == "T1059.001" for h in hits(client, "t1059.001"))
    parent = hits(client, "T1003")
    assert any(h["kind"] == "story" for h in parent), "a parent id must include its sub-techniques' content"


def test_a_tactic_name_finds_its_techniques_and_content(client: TestClient) -> None:
    found = hits(client, "credential access")
    assert {"technique", "rule", "story"} <= kinds(found)
    assert any(h["id"] == "T1003" or h["id"].startswith("T1003") for h in found if h["kind"] == "technique")
    assert hits(client, "credential-access") != []


def test_dns_finds_rules_datasets_and_labs(client: TestClient) -> None:
    found = hits(client, "dns")
    assert {"rule", "dataset", "lab"} <= kinds(found)
    assert any(h["kind"] == "dataset" and h["id"] == "dns-anomalies" for h in found)


@pytest.mark.parametrize("fmt", ["sigma", "yara", "suricata"])
def test_format_names_find_rules_of_that_format(client: TestClient, fmt: str) -> None:
    rules = [h for h in hits(client, fmt) if h["kind"] == "rule"]
    assert rules and all(h["badge"] == fmt for h in rules[:3])


def test_results_carry_a_clear_type_and_a_working_link(client: TestClient) -> None:
    for query in ("powershell", "T1059.001", "dns", "credential access"):
        for h in hits(client, query):
            assert h["kind"] in {"lab", "story", "rule", "dataset", "technique", "alert", "doc", "learning", "indicator"}
            assert h["href"].startswith("/") and h["title"]
    story = next(h for h in hits(client, "developer workstation") if h["kind"] == "story")
    assert story["href"] == "/stories/compromised-developer-workstation" and story["subtitle"].startswith("Story")
    dataset = next(h for h in hits(client, "authentication failures") if h["kind"] == "dataset")
    assert dataset["href"].startswith("/detections/playground?dataset=")


def test_each_kind_is_capped_and_stories_rank_title_matches_first(client: TestClient) -> None:
    found = hits(client, "attack")
    per_kind: dict[str, int] = {}
    for h in found:
        per_kind[h["kind"]] = per_kind.get(h["kind"], 0) + 1
    assert max(per_kind.values()) <= 5
    stories = [h["id"] for h in hits(client, "web application intrusion") if h["kind"] == "story"]
    assert stories[0] == "web-application-intrusion"


def test_wildcards_and_unknown_queries_return_nothing_rather_than_everything(client: TestClient) -> None:
    assert hits(client, "%%") == []
    assert hits(client, "zzzz-no-such-thing") == []


# --- the meaning layer, without the database ------------------------------------------------------


def test_tactic_and_id_resolution(bundle: ContentBundle) -> None:
    assert "T1003.001" in search_service.technique_ids_for(bundle, "T1003")
    assert search_service.technique_ids_for(bundle, "T1003.001") == {"T1003.001"}
    assert "T1059.001" in search_service.technique_ids_for(bundle, "Execution")
    assert search_service.technique_ids_for(bundle, "powershell") == set()
    assert search_service.technique_ids_for(bundle, "TA0006") >= {"T1003.001"}


def test_content_matches_expose_stories_and_datasets_for_a_technique(bundle: ContentBundle) -> None:
    found = search_service.search_content(bundle, "T1547.001")
    assert any(h.id == "compromised-developer-workstation" for h in found.stories)
    assert any(h.id == "suspicious-powershell-simulation" for h in found.datasets)
    assert "win-run-key-persistence-set" in found.rule_slugs
