"""Phase 8 production-readiness tests — health, CSV safety, CORS, config."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from ats_auth import AtsPrincipal, get_current_ats_user
from main import app
from services.csv_safe import csv_safe_cell, csv_safe_row
from services.prod_config import validate_production_env


def _principal(role: str, user_id: str = "user-1") -> AtsPrincipal:
    p = AtsPrincipal(user_id=user_id, claims={})
    p._resolved_role = role
    return p


@pytest.fixture()
def as_role():
    def _set(role: str, user_id: str = "user-1"):
        app.dependency_overrides[get_current_ats_user] = lambda: _principal(role, user_id)

    yield _set
    app.dependency_overrides.pop(get_current_ats_user, None)


def test_health_liveness(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"
    assert "X-Request-ID" in r.headers
    assert r.headers.get("X-Content-Type-Options") == "nosniff"
    assert r.headers.get("X-Frame-Options") == "DENY"


def test_health_ready(client):
    r = client.get("/health/ready")
    assert r.status_code in (200, 503)
    body = r.json()
    assert "status" in body
    assert "checks" in body
    assert "database" in body["checks"]
    dumped = str(body).lower()
    for forbidden in ("sk_", "password=", "secret=", "token=", "-----begin"):
        assert forbidden not in dumped


def test_csv_formula_injection_prefix():
    assert csv_safe_cell("=CMD()") == "'=CMD()"
    assert csv_safe_cell("+1-555") == "'+1-555"
    assert csv_safe_cell("-SUM(A1)") == "'-SUM(A1)"
    assert csv_safe_cell("@mention") == "'@mention"
    assert csv_safe_cell("Normal Name") == "Normal Name"
    assert csv_safe_cell(None) == ""
    assert csv_safe_row(["ok", "=1+1", None]) == ["ok", "'=1+1", ""]


def test_csv_export_escapes_and_redacts(client, db_session, as_role):
    as_role("admin")
    r = client.get("/api/reports/export", params={"report_type": "overview", "format": "csv"})
    assert r.status_code == 200
    assert "text/csv" in r.headers.get("content-type", "")
    body = r.content.decode("utf-8-sig", errors="replace").lower()
    for leak in ("resume_text", "access_token", "refresh_token", "body_html"):
        assert leak not in body


def test_prod_config_rejects_wildcard_cors(monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@localhost/db")
    monkeypatch.setenv("ALLOWED_ORIGINS", "*")
    with pytest.raises(RuntimeError) as exc:
        validate_production_env(enforce_auth=True)
    assert "ALLOWED_ORIGINS" in str(exc.value)


def test_prod_config_noop_outside_production(monkeypatch):
    monkeypatch.setenv("ENV", "development")
    monkeypatch.delenv("ALLOWED_ORIGINS", raising=False)
    validate_production_env(enforce_auth=False)


def test_reports_unauthorized_override(client, db_session):
    def _deny():
        raise HTTPException(status_code=401, detail="expired")

    app.dependency_overrides[get_current_ats_user] = _deny
    try:
        r = client.get("/api/reports/overview")
        assert r.status_code == 401
    finally:
        app.dependency_overrides.pop(get_current_ats_user, None)


def test_read_only_can_view_reports(client, db_session, as_role):
    as_role("read_only")
    r = client.get("/api/reports/overview")
    assert r.status_code == 200
    assert r.json()["scope"] == "organization"
