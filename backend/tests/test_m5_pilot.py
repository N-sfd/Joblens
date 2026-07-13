"""Phase 5 M5 — pilot metrics and entitlement."""

from __future__ import annotations

import os

from auth import Owner
from services.pilot_metrics import collect_pilot_metrics
from services import extension_flags as ef


def _connect(client, guest_headers):
    challenge = "m5challenge0123456789abcdef"
    assert client.post(
        "/api/extension/auth/start",
        json={"challenge": challenge, "extension_version": "0.3.0"},
    ).status_code == 200
    assert client.post(
        "/api/extension/auth/confirm",
        json={"challenge": challenge},
        headers=guest_headers,
    ).status_code == 200
    for _ in range(5):
        ex = client.post("/api/extension/auth/exchange", json={"challenge": challenge})
        if ex.status_code == 200:
            return ex.json()
    raise AssertionError("exchange failed")


def test_pilot_me_endpoint(client, guest_headers):
    tokens = _connect(client, guest_headers)
    r = client.get(
        "/api/extension/pilot/me",
        headers={
            "Authorization": f"Bearer {tokens['access_token']}",
            "X-JobLens-Extension-Version": "0.3.0",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["capabilities"]["submit_application"] is False
    assert body["automatic_submission_enabled"] is False
    assert "pilot_user" in body
    assert "message" in body


def test_pilot_metrics_requires_ops_token(client, db_session, monkeypatch):
    monkeypatch.setenv("EXTENSION_OPS_TOKEN", "ops-secret-m5")
    bad = client.post("/api/extension/ops/pilot-metrics", json={"admin_token": "wrong", "since_hours": 24})
    assert bad.status_code == 403
    ok = client.post(
        "/api/extension/ops/pilot-metrics",
        json={"admin_token": "ops-secret-m5", "since_hours": 24},
    )
    assert ok.status_code == 200, ok.text
    data = ok.json()
    assert "diagnostics" in data
    assert "fill_sessions" in data
    assert "feedback" in data
    blob = str(data).lower()
    assert "bearer " not in blob
    assert "password" not in blob


def test_collect_pilot_metrics_empty(db_session):
    report = collect_pilot_metrics(db_session, since_hours=24)
    assert report["diagnostics"]["total"] == 0
    assert report["fill_sessions"]["total"] == 0
    assert any("exclude" in n.lower() or "field values" in n.lower() for n in report["notes"])


def test_production_pilot_gates_fill(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("EXTENSION_PILOT_USER_IDS", "99")
    monkeypatch.setenv("EXTENSION_ASSISTED_FILL_ENABLED", "true")
    monkeypatch.setenv("EXTENSION_DOCUMENT_UPLOAD_ENABLED", "true")
    # Force production branch in load_flags
    caps = ef.effective_capabilities(Owner(user_id=1))
    assert caps["pilot_user"] is False
    assert caps["fill_form"] is False
    assert caps["upload_resume"] is False
    caps_ok = ef.effective_capabilities(Owner(user_id=99))
    assert caps_ok["pilot_user"] is True
    assert caps_ok["fill_form"] is True
    monkeypatch.setenv("ENV", "test")
