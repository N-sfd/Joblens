"""Candidate create authentication — same ATS dependency chain as other CRM routes."""

from __future__ import annotations

import inspect

import pytest
from fastapi import HTTPException

import ats_auth
from ats_auth import (
    FORBIDDEN_MSG,
    UNAUTHORIZED_MSG,
    AtsPrincipal,
    get_current_ats_user,
    require_writer,
)
from main import app
from models import Employee


PAYLOAD = {
    "name": "Alex Candidate",
    "email": "alex.candidate@example.com",
    "status": "New",
    "source": "Manual",
}


def _principal(role: str, user_id: str = "user-writer") -> AtsPrincipal:
    p = AtsPrincipal(user_id=user_id, claims={"sub": user_id}, email=f"{role}@example.com")
    p._resolved_role = role
    p.role_source = "test"
    return p


@pytest.fixture()
def as_role(monkeypatch):
    def _set(role: str, user_id: str = "user-writer"):
        principal = _principal(role, user_id)
        monkeypatch.setattr(ats_auth, "ENFORCE", True)
        monkeypatch.setattr(ats_auth, "get_current_ats_user", lambda request: principal)

    yield _set
    monkeypatch.setattr(ats_auth, "ENFORCE", False)
    app.dependency_overrides.pop(get_current_ats_user, None)


def test_candidate_create_uses_require_writer_dependency():
    from routers import employees

    dep = inspect.signature(employees.create_employee).parameters["principal"].default
    assert getattr(dep, "dependency", None) is require_writer


def test_unauthenticated_candidate_create_returns_401(client, monkeypatch):
    monkeypatch.setattr(ats_auth, "ENFORCE", True)

    def deny_missing(request):
        raise HTTPException(status_code=401, detail=UNAUTHORIZED_MSG)

    monkeypatch.setattr(ats_auth, "get_current_ats_user", deny_missing)
    res = client.post("/api/candidates/", json=PAYLOAD)
    assert res.status_code == 401
    assert res.json()["detail"] == UNAUTHORIZED_MSG


def test_read_only_candidate_create_returns_403(client, as_role):
    as_role("read_only")
    res = client.post("/api/candidates/", json=PAYLOAD)
    assert res.status_code == 403
    assert res.json()["detail"] == FORBIDDEN_MSG


def test_no_role_user_receives_403(client, as_role):
    as_role("read_only", user_id="user-norole")
    res = client.post("/api/candidates/", json={**PAYLOAD, "email": "norole@example.com"})
    assert res.status_code == 403


@pytest.mark.parametrize("role", ["admin", "manager", "recruiter"])
def test_writer_roles_may_create_candidate(client, db_session, as_role, role):
    as_role(role, user_id=f"user-{role}")
    res = client.post(
        "/api/candidates/",
        json={**PAYLOAD, "email": f"{role}.create@example.com"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["email"] == f"{role}.create@example.com"
    assert db_session.query(Employee).filter(Employee.id == body["id"]).first() is not None


def test_expired_token_returns_401(monkeypatch):
    monkeypatch.setattr(
        ats_auth.jwt,
        "get_unverified_header",
        lambda token: {"kid": "k1", "alg": "RS256"},
    )
    monkeypatch.setattr(ats_auth, "_fetch_jwks", lambda force=False: [{"kid": "k1", "kty": "RSA"}])

    class ExpiredSignatureError(Exception):
        pass

    def boom(*args, **kwargs):
        raise ExpiredSignatureError("Signature has expired.")

    monkeypatch.setattr(ats_auth.jwt, "decode", boom)

    class FakeUrl:
        path = "/api/candidates/"

    class FakeReq:
        url = FakeUrl()
        method = "POST"
        state = type("S", (), {"request_id": "req-test"})()

    with pytest.raises(HTTPException) as ei:
        ats_auth._verify_token("fake.token.value", request=FakeReq())  # type: ignore[arg-type]
    assert ei.value.status_code == 401
    assert ei.value.detail == UNAUTHORIZED_MSG


def test_invalid_issuer_returns_401(monkeypatch):
    monkeypatch.setattr(
        ats_auth.jwt,
        "get_unverified_header",
        lambda token: {"kid": "k1", "alg": "RS256"},
    )
    monkeypatch.setattr(ats_auth, "_fetch_jwks", lambda force=False: [{"kid": "k1", "kty": "RSA"}])

    class JWTClaimsError(Exception):
        pass

    def boom(*args, **kwargs):
        raise JWTClaimsError("Invalid issuer")

    monkeypatch.setattr(ats_auth.jwt, "decode", boom)

    class FakeUrl:
        path = "/api/candidates/"

    class FakeReq:
        url = FakeUrl()
        method = "POST"
        state = type("S", (), {"request_id": "req-iss"})()

    with pytest.raises(HTTPException) as ei:
        ats_auth._verify_token("fake.token.value", request=FakeReq())  # type: ignore[arg-type]
    assert ei.value.status_code == 401


def test_invalid_audience_returns_401(monkeypatch):
    monkeypatch.setattr(
        ats_auth.jwt,
        "get_unverified_header",
        lambda token: {"kid": "k1", "alg": "RS256"},
    )
    monkeypatch.setattr(ats_auth, "_fetch_jwks", lambda force=False: [{"kid": "k1", "kty": "RSA"}])

    def boom(*args, **kwargs):
        raise Exception("Invalid audience")

    monkeypatch.setattr(ats_auth.jwt, "decode", boom)

    class FakeUrl:
        path = "/api/candidates/"

    class FakeReq:
        url = FakeUrl()
        method = "POST"
        state = type("S", (), {"request_id": "req-aud"})()

    with pytest.raises(HTTPException) as ei:
        ats_auth._verify_token("fake.token.value", request=FakeReq())  # type: ignore[arg-type]
    assert ei.value.status_code == 401


def test_same_auth_gate_as_other_ats_writer_routes(client, as_role):
    as_role("read_only")
    denied = client.post("/api/candidates/", json={**PAYLOAD, "email": "ro@example.com"})
    assert denied.status_code == 403

    as_role("recruiter")
    ok = client.post("/api/candidates/", json={**PAYLOAD, "email": "recruiter.gate@example.com"})
    assert ok.status_code == 201
