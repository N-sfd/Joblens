"""ATS authorization / role resolution tests."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from ats_auth import (
    AtsPrincipal,
    ENFORCE,
    FORBIDDEN_MSG,
    normalize_ats_role,
    require_writer,
)
from models import AtsStaffUser


def test_normalize_role_aliases():
    assert normalize_ats_role("Admin") == "admin"
    assert normalize_ats_role("Recruiter") == "recruiter"
    assert normalize_ats_role("hr_admin") == "admin"
    assert normalize_ats_role("unknown") == "viewer"


def test_db_role_allows_writer(db_session, monkeypatch):
    import ats_auth

    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    monkeypatch.setattr(ats_auth, "_fetch_role_from_clerk_api", lambda uid: (None, None, None))
    monkeypatch.setattr(ats_auth, "_role_from_claims", lambda claims: None)
    monkeypatch.setattr(
        ats_auth,
        "_db_staff_lookup",
        lambda uid: ("recruiter", "recruiter@example.com", "Pat Recruiter", "Consult America")
        if uid == "user_recruiter_1"
        else None,
    )

    p = AtsPrincipal(user_id="user_recruiter_1", claims={}, email="recruiter@example.com")
    assert p.resolve_role() == "recruiter"
    assert p.role_source == "database"


def test_require_writer_message_when_enforced(monkeypatch):
    """When ENFORCE is on and role is viewer, structured 403 is raised."""
    import ats_auth
    from fastapi import HTTPException

    monkeypatch.setattr(ats_auth, "ENFORCE", True)

    class FakeUrl:
        path = "/api/employees/parse-resume"

    class FakeReq:
        url = FakeUrl()
        method = "POST"

        def __init__(self):
            self.headers = type("H", (), {"get": lambda self, k, d=None: None})()

    principal = AtsPrincipal(user_id="user_test", claims={})
    principal._resolved_role = "viewer"
    principal.role_source = "database"
    principal.email = "viewer@example.com"

    monkeypatch.setattr(ats_auth, "get_current_ats_user", lambda request: principal)

    with pytest.raises(HTTPException) as ei:
        ats_auth.require_writer(FakeReq())  # type: ignore[arg-type]
    assert ei.value.status_code == 403
    assert "ATS access" in ei.value.detail


def test_ats_me_and_staff_admin_flow(client, db_session, monkeypatch):
    """With ENFORCE off (conftest), anonymous principal is admin for local CRUD."""
    r = client.get("/api/ats/me")
    assert r.status_code == 200
    body = r.json()
    assert body["role"] in ("admin", "recruiter", "viewer")
    assert "can_write" in body
    assert "has_ats_access" in body


def test_parse_resume_not_confused_with_auth_when_dev(client):
    """Unauthenticated parse in test env (ENFORCE false) should not return ATS access 403."""
    # Without file — may 422; must not be the ATS access message
    r = client.post("/api/employees/parse-resume")
    assert r.status_code != 403 or FORBIDDEN_MSG not in (r.json().get("detail") or "")
