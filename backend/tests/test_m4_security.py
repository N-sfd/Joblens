"""Phase 5 M4 — feature flags, version gates, rate limits, audit (SQLite + optional Postgres)."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest
from fastapi.testclient import TestClient

from services.extension_config import version_allowed, version_satisfies_min, load_extension_config
from services.extension_flags import effective_capabilities, load_flags, is_pilot_user
from auth import Owner
from services import extension_auth as ext_auth
from services import extension_audit as ext_audit


def _ext_headers(token: str, version: str = "0.3.0") -> dict:
    return {
        "Authorization": f"Bearer {token}",
        "X-JobLens-Extension-Version": version,
        "X-Guest-Id": "guest-test-aaaa-bbbb-cccc-ddddeeee",
    }


def _connect_extension(client: TestClient, guest_headers: dict) -> dict:
    challenge = "m4challenge0123456789abcdef"
    r = client.post(
        "/api/extension/auth/start",
        json={"challenge": challenge, "extension_version": "0.3.0"},
    )
    assert r.status_code == 200, r.text
    r = client.post(
        "/api/extension/auth/confirm",
        json={"challenge": challenge},
        headers=guest_headers,
    )
    assert r.status_code == 200, r.text
    # Poll exchange
    for _ in range(5):
        ex = client.post("/api/extension/auth/exchange", json={"challenge": challenge})
        if ex.status_code == 200:
            return ex.json()
    raise AssertionError("token exchange failed")


def test_version_gate_rejects_old():
    ok, reason = version_allowed("0.2.0")
    assert not ok
    assert "minimum" in reason.lower() or "Update" in reason


def test_version_satisfies_min():
    assert version_satisfies_min("0.3.0", "0.3.0")
    assert version_satisfies_min("0.4.0", "0.3.0")
    assert not version_satisfies_min("0.2.9", "0.3.0")


def test_no_automatic_submission_flag():
    f = load_flags()
    assert f.automatic_submission_enabled is False
    caps = effective_capabilities(Owner(guest_id="g1"))
    assert caps["submit_application"] is False
    assert caps["automatic_submission_enabled"] is False


def test_status_reflects_capabilities(client, guest_headers):
    tokens = _connect_extension(client, guest_headers)
    r = client.get("/api/extension/status", headers=_ext_headers(tokens["access_token"]))
    assert r.status_code == 200
    body = r.json()
    assert body["capabilities"]["submit_application"] is False
    assert body["flags"]["automatic_submission_enabled"] is False
    assert "versions" in body


def test_auth_start_rejects_blocked_version(client, monkeypatch):
    monkeypatch.setenv("EXTENSION_BLOCKED_VERSIONS", "0.3.0")
    # Reload config by calling version_allowed with fresh env — load_extension_config reads env each call
    from services import extension_config

    monkeypatch.setattr(
        extension_config,
        "load_extension_config",
        lambda: extension_config.ExtensionRuntimeConfig(
            jwt_secret="test-secret-key",
            token_issuer="joblens-extension",
            token_audience="joblens-extension-api",
            allowed_origins=frozenset(),
            allowed_extension_ids=frozenset(),
            allowed_versions=frozenset(),
            min_extension_version="0.3.0",
            blocked_versions=frozenset({"0.3.0"}),
            access_token_ttl_seconds=900,
            refresh_token_ttl_seconds=604800,
            document_token_ttl_seconds=300,
            frontend_base_url="http://localhost:3000",
            api_base_url="http://localhost:8000",
        ),
    )
    monkeypatch.setattr(ext_auth, "load_extension_config", extension_config.load_extension_config)
    monkeypatch.setattr(ext_auth, "version_allowed", extension_config.version_allowed)
    r = client.post(
        "/api/extension/auth/start",
        json={"challenge": "blockedver0123456789abcdef01", "extension_version": "0.3.0"},
    )
    assert r.status_code == 426


def test_rate_limit_auth_challenge(client, monkeypatch):
    from services import rate_limit as rl

    monkeypatch.setattr(rl, "EXT_AUTH_CHALLENGE_LIMIT", 2)
    # Clear hit buckets
    with rl._lock:
        rl._hits.clear()
    ok = 0
    limited = 0
    for i in range(5):
        r = client.post(
            "/api/extension/auth/start",
            json={"challenge": f"rlchal{i:020d}abcdef", "extension_version": "0.3.0"},
        )
        if r.status_code == 200:
            ok += 1
        elif r.status_code == 429:
            limited += 1
    assert limited >= 1
    assert ok <= 2


def test_feedback_endpoint(client, guest_headers):
    tokens = _connect_extension(client, guest_headers)
    r = client.post(
        "/api/extension/feedback",
        headers=_ext_headers(tokens["access_token"]),
        json={
            "category": "form_not_detected",
            "message": "Could not find form",
            "platform": "greenhouse",
            "extension_version": "0.3.0",
            "feature_stage": "analyze",
            "error_code": "NO_FORM",
        },
    )
    assert r.status_code == 201
    assert r.json()["received"] is True


def test_audit_event_no_secrets(db_session):
    ext_audit.log_extension_event(
        db_session,
        "extension.connected",
        user_id="guest:abc",
        session_id="jti1",
        extension_version="0.3.0",
        outcome="ok",
        extra_summary="Bearer secret-token-should-redact",
    )
    from models import AuditLog

    row = db_session.query(AuditLog).order_by(AuditLog.id.desc()).first()
    assert row is not None
    assert "Bearer" not in (row.summary or "") or "[redacted]" in (row.summary or "")


def test_revoke_then_status_fails(client, guest_headers):
    tokens = _connect_extension(client, guest_headers)
    r = client.post(
        "/api/extension/auth/revoke",
        json={"refresh_token": tokens["refresh_token"]},
    )
    assert r.status_code == 200
    r = client.get("/api/extension/status", headers=_ext_headers(tokens["access_token"]))
    assert r.status_code == 401


def test_feature_flag_blocks_fill(client, guest_headers, monkeypatch):
    monkeypatch.setenv("EXTENSION_ASSISTED_FILL_ENABLED", "false")
    # force reload via patching load_flags
    from services import extension_flags as ef

    monkeypatch.setattr(
        ef,
        "load_flags",
        lambda: ef.ExtensionFlags(
            extension_enabled=True,
            diagnostics_enabled=True,
            assisted_fill_enabled=False,
            document_upload_enabled=True,
            submission_confirmation_enabled=True,
            greenhouse_enabled=True,
            automatic_submission_enabled=False,
        ),
    )
    tokens = _connect_extension(client, guest_headers)
    r = client.post(
        "/api/extension/fill-session/start",
        headers=_ext_headers(tokens["access_token"]),
        json={"platform": "greenhouse", "detected_fields": [], "extension_version": "0.3.0"},
    )
    assert r.status_code == 403


def test_pilot_user_detection(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("EXTENSION_PILOT_USER_IDS", "42")
    monkeypatch.setenv("EXTENSION_PILOT_GUEST_IDS", "")
    assert is_pilot_user(Owner(user_id=42))
    assert not is_pilot_user(Owner(user_id=99))
    monkeypatch.setenv("ENV", "test")


@pytest.mark.skipif(
    not os.getenv("TEST_DATABASE_URL", "").startswith("postgresql"),
    reason="Set TEST_DATABASE_URL=postgresql://… to run Postgres integration tests",
)
def test_postgres_json_and_unique(monkeypatch):
    """Real PostgreSQL JSON + unique constraint behavior (no mocks)."""
    url = os.environ["TEST_DATABASE_URL"]
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker
    from database import Base
    import models  # noqa: F401

    engine = create_engine(url, pool_pre_ping=True)
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    db = Session()
    try:
        val = db.execute(text("SELECT CAST(:j AS jsonb) ->> 'k'"), {"j": '{"k":"v"}'}).scalar()
        assert val == "v"
        # Concurrent-ish unique jti
        from models import ExtensionToken
        from datetime import datetime, timedelta

        def insert_once(jti: str) -> str:
            s = Session()
            try:
                s.add(
                    ExtensionToken(
                        jti=jti,
                        guest_id="g-pg",
                        access_token_hash="a" * 64,
                        refresh_token_hash="b" * 64,
                        expires_at=datetime.utcnow() + timedelta(minutes=15),
                        refresh_expires_at=datetime.utcnow() + timedelta(days=7),
                    )
                )
                s.commit()
                return "ok"
            except Exception:
                s.rollback()
                return "dup"
            finally:
                s.close()

        jti = "pg-unique-jti-m4-test-001"
        db.query(ExtensionToken).filter(ExtensionToken.jti == jti).delete()
        db.commit()
        with ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(insert_once, [jti] * 4))
        assert results.count("ok") == 1
        assert results.count("dup") == 3
    finally:
        db.close()
        engine.dispose()


def test_production_config_rejects_dev_secret(monkeypatch):
    from services.extension_config import validate_extension_config_at_startup

    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("EXTENSION_JWT_SECRET", "dev-insecure-secret-change-me")
    monkeypatch.setenv("SECRET_KEY", "dev-insecure-secret-change-me")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./x.db")
    with pytest.raises(RuntimeError):
        validate_extension_config_at_startup()
    monkeypatch.setenv("ENV", "test")
