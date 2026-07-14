"""Unified Pipeline module — role scope, duplicates, stage transitions, filters."""

from datetime import datetime

import pytest

from ats_auth import AtsPrincipal, get_current_ats_user
from main import app
from models import (
    Employee,
    EmployeeResume,
    Interview,
    JobRequirement,
    Offer,
    Submission,
)


def _principal(role: str, user_id: str = "user-1") -> AtsPrincipal:
    p = AtsPrincipal(user_id=user_id, claims={})
    p._resolved_role = role
    return p


@pytest.fixture()
def as_role(client, monkeypatch):
    def _set(role: str, user_id: str = "user-1"):
        principal = _principal(role, user_id)
        import ats_auth
        monkeypatch.setattr(ats_auth, "get_current_ats_user", lambda request=None: principal)
        app.dependency_overrides[get_current_ats_user] = lambda: principal

    yield _set
    app.dependency_overrides.pop(get_current_ats_user, None)


_emp_seq = [0]


def make_employee(db, **overrides):
    _emp_seq[0] += 1
    defaults = dict(
        name=f"Jamie Candidate {_emp_seq[0]}",
        email=f"jamie{_emp_seq[0]}@example.com",
        status="Active",
        created_by="user-1",
    )
    defaults.update(overrides)
    emp = Employee(**defaults)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def make_job(db, **overrides):
    defaults = dict(job_title="Backend Engineer", status="Open", source="Manual", created_by="user-1")
    defaults.update(overrides)
    job = JobRequirement(**defaults)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def make_resume(db, employee_id, **overrides):
    defaults = dict(
        employee_id=employee_id,
        filename="resume.pdf",
        original_filename="resume.pdf",
        file_type="pdf",
        file_size=100,
        file_path="/tmp/resume.pdf",
        is_primary=True,
        parsing_status="parsed",
        version_number=1,
    )
    defaults.update(overrides)
    r = EmployeeResume(**defaults)
    db.add(r)
    db.commit()
    db.refresh(r)
    return r


def make_submission(db, job, emp, **overrides):
    defaults = dict(
        job_requirement_id=job.id,
        employee_id=emp.id,
        status="Draft",
        created_by="user-1",
    )
    defaults.update(overrides)
    sub = Submission(**defaults)
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def pipeline_payload(job_id, employee_id, **overrides):
    payload = {
        "job_requirement_id": job_id,
        "employee_id": employee_id,
        "status": "Draft",
    }
    payload.update(overrides)
    return payload


# --- Role scoping ---

def test_admin_lists_org_wide(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    e1 = make_employee(db_session, created_by="recruiter-a")
    e2 = make_employee(db_session, created_by="recruiter-b")
    make_submission(db_session, job, e1, created_by="recruiter-a")
    make_submission(db_session, job, e2, created_by="recruiter-b")
    res = client.get("/api/pipeline/")
    assert res.status_code == 200
    assert res.json()["total"] == 2


def test_recruiter_sees_only_own(client, db_session, as_role):
    job = make_job(db_session)
    e1 = make_employee(db_session)
    e2 = make_employee(db_session)
    make_submission(db_session, job, e1, created_by="recruiter-a")
    make_submission(db_session, job, e2, created_by="other")
    as_role("recruiter", "recruiter-a")
    body = client.get("/api/pipeline/").json()
    assert body["total"] == 1
    assert body["items"][0]["created_by"] == "recruiter-a"


def test_read_only_cannot_mutate(client, db_session, as_role, monkeypatch):
    import ats_auth
    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    as_role("read_only")
    job = make_job(db_session)
    emp = make_employee(db_session)
    res = client.post("/api/pipeline/", json=pipeline_payload(job.id, emp.id))
    assert res.status_code in (401, 403)


def test_existing_records_accessible_via_submissions_alias(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session)
    sub = make_submission(db_session, job, emp, status="Submitted")
    res = client.get(f"/api/submissions/{sub.id}")
    assert res.status_code == 200
    assert res.json()["id"] == sub.id
    assert res.json()["status_display"] in ("Submitted", "Client Review")


# --- Duplicate prevention ---

def test_duplicate_create_returns_409(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session)
    first = client.post("/api/pipeline/", json=pipeline_payload(job.id, emp.id))
    assert first.status_code == 201
    second = client.post("/api/pipeline/", json=pipeline_payload(job.id, emp.id, status="Contacted"))
    assert second.status_code == 409
    detail = second.json()["detail"]
    assert detail["message"] == "This candidate is already in the pipeline for this job."
    assert detail["submission_id"] == first.json()["id"]


# --- Stage transitions ---

def test_stage_transition(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session)
    make_resume(db_session, emp.id)
    sub = make_submission(db_session, job, emp, status="Draft")
    res = client.patch(
        f"/api/pipeline/{sub.id}/stage",
        json={"stage": "Contacted"},
    )
    assert res.status_code == 200
    assert res.json()["status_display"] == "Contacted"
    assert res.json()["status"] == "Employee Contacted"


def test_reject_requires_reason(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session)
    sub = make_submission(db_session, job, emp, status="Submitted")
    res = client.post(f"/api/pipeline/{sub.id}/reject", json={"reason": ""})
    assert res.status_code == 422
    ok = client.post(
        f"/api/pipeline/{sub.id}/reject",
        json={"reason": "Skills mismatch"},
    )
    assert ok.status_code == 200
    assert ok.json()["status_display"] == "Rejected"


def test_place_requires_confirm(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session)
    sub = make_submission(db_session, job, emp, status="Offer")
    db_session.add(Offer(submission_id=sub.id, status="Accepted", created_by="user-1"))
    db_session.commit()

    denied = client.post(
        f"/api/pipeline/{sub.id}/place",
        json={"confirmed": False, "override_reason": "admin place"},
    )
    assert denied.status_code == 422

    ok = client.post(
        f"/api/pipeline/{sub.id}/place",
        json={"confirmed": True, "override_reason": "admin place"},
    )
    assert ok.status_code == 200
    assert ok.json()["status_display"] == "Placed"


# --- Search / filters / pagination ---

def test_search_by_candidate(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    e1 = make_employee(db_session, name="Alice Wonder")
    e2 = make_employee(db_session, name="Bob Builder")
    make_submission(db_session, job, e1)
    make_submission(db_session, job, e2)
    res = client.get("/api/pipeline/", params={"q": "Alice"})
    assert res.json()["total"] == 1
    assert "Alice" in (res.json()["items"][0]["employee_name"] or "")


def test_stage_group_filter(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    e1 = make_employee(db_session)
    e2 = make_employee(db_session)
    e3 = make_employee(db_session)
    make_submission(db_session, job, e1, status="Submitted")
    make_submission(db_session, job, e2, status="Client Review")
    make_submission(db_session, job, e3, status="Draft")
    res = client.get("/api/pipeline/", params={"stage_group": "submitted"})
    assert res.json()["total"] == 2


def test_pagination(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    for _ in range(5):
        emp = make_employee(db_session)
        make_submission(db_session, job, emp)
    res = client.get("/api/pipeline/", params={"page": 1, "page_size": 2})
    body = res.json()
    assert body["total"] == 5
    assert len(body["items"]) == 2
    assert body["page_size"] == 2
    assert body["total_pages"] == 3


def test_legacy_limit_returns_bare_list(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session)
    make_submission(db_session, job, emp)
    res = client.get("/api/pipeline/", params={"limit": 10})
    assert res.status_code == 200
    assert isinstance(res.json(), list)


def test_dashboard_submitted_count_equals_filter(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    for status in ("Submitted", "Client Review", "Draft", "Selected"):
        make_submission(db_session, job, make_employee(db_session), status=status)

    filt = client.get("/api/pipeline/", params={"stage_group": "submitted"}).json()["total"]
    dash = client.get("/api/dashboard/summary").json()["counts"]["candidates_submitted"]
    assert filt == dash == 2
