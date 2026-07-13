"""Phase 5 M1 — extension auth + diagnostics ownership."""

from __future__ import annotations

import uuid

import pytest


def _start(client, challenge: str | None = None):
    ch = challenge or str(uuid.uuid4())
    r = client.post("/api/extension/auth/start", json={"challenge": ch, "extension_version": "0.3.0"})
    assert r.status_code == 200, r.text
    return ch


def _confirm_and_exchange(client, challenge: str, headers: dict):
    c = client.post("/api/extension/auth/confirm", json={"challenge": challenge}, headers=headers)
    assert c.status_code == 200, c.text
    ex = client.post("/api/extension/auth/exchange", json={"challenge": challenge})
    assert ex.status_code == 200, ex.text
    return ex.json()


def test_extension_auth_flow_and_status(client, guest_headers):
    ch = _start(client)
    tokens = _confirm_and_exchange(client, ch, guest_headers)
    assert "access_token" in tokens
    assert "refresh_token" in tokens

    st = client.get(
        "/api/extension/status",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert st.status_code == 200
    body = st.json()
    assert body["connected"] is True
    assert body["capabilities"]["fill_form"] is True
    assert body["capabilities"]["upload_resume"] is True
    assert body["capabilities"]["submit_application"] is False


def test_expired_or_invalid_token_rejected(client, guest_headers):
    st = client.get(
        "/api/extension/status",
        headers={"Authorization": "Bearer not-a-real-token"},
    )
    assert st.status_code == 401


def test_revoked_token_stops_working(client, guest_headers):
    ch = _start(client)
    tokens = _confirm_and_exchange(client, ch, guest_headers)
    rev = client.post("/api/extension/auth/revoke", json={"refresh_token": tokens["refresh_token"]})
    assert rev.status_code == 200
    assert rev.json()["revoked"] >= 1

    st = client.get(
        "/api/extension/status",
        headers={"Authorization": f"Bearer {tokens['access_token']}"},
    )
    assert st.status_code == 401


def test_diagnostic_ownership(client, guest_headers, other_guest_headers):
    ch = _start(client)
    tokens = _confirm_and_exchange(client, ch, guest_headers)
    auth = {"Authorization": f"Bearer {tokens['access_token']}"}

    created = client.post(
        "/api/extension/diagnostics",
        headers=auth,
        json={
            "application_url": "https://boards.greenhouse.io/acme/jobs/1",
            "platform": "greenhouse",
            "employer": "acme",
            "job_title": "Engineer",
            "detected_fields": [
                {
                    "external_field_key": "first_name",
                    "field_label": "First Name",
                    "field_type": "text",
                    "is_required": True,
                    "classification": "supported",
                    "normalized_field_name": "first_name",
                    "confidence": 0.9,
                    "options": [],
                    "is_upload": False,
                }
            ],
            "supported_count": 1,
            "sensitive_count": 0,
            "unsupported_count": 0,
            "detector_version": "1.0.0-m1",
            "extension_version": "0.1.0",
        },
    )
    assert created.status_code == 201, created.text
    diag_id = created.json()["id"]

    ok = client.get(f"/api/extension/diagnostics/{diag_id}", headers=auth)
    assert ok.status_code == 200

    # Other guest connects separately and must not see this diagnostic
    ch2 = _start(client)
    tokens2 = _confirm_and_exchange(client, ch2, other_guest_headers)
    other = client.get(
        f"/api/extension/diagnostics/{diag_id}",
        headers={"Authorization": f"Bearer {tokens2['access_token']}"},
    )
    assert other.status_code == 404


def test_diagnostic_rejects_when_not_authenticated(client):
    r = client.post(
        "/api/extension/diagnostics",
        json={"platform": "greenhouse", "detected_fields": []},
    )
    assert r.status_code == 401


def test_refresh_rotates_token(client, guest_headers):
    ch = _start(client)
    tokens = _confirm_and_exchange(client, ch, guest_headers)
    refreshed = client.post(
        "/api/extension/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert refreshed.status_code == 200
    new = refreshed.json()
    assert new["access_token"] != tokens["access_token"]

    # Old refresh should fail
    again = client.post(
        "/api/extension/auth/refresh",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert again.status_code == 401
