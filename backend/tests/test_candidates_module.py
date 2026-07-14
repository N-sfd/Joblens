"""Unified Candidates module — Employee entity reuse, filters, role scope,
duplicate detection, delete guards, status normalization, API aliases."""

from datetime import datetime

import pytest

from ats_auth import AtsPrincipal, get_current_ats_user
from main import app
from models import (
    Employee,
    EmployeeResume,
    Interview,
    JobEmployeeSend,
    JobRequirement,
    Offer,
    Submission,
)
from services.candidate_status import normalize_candidate_status


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


def candidate_payload(**overrides):
    n = _emp_seq[0] + 1000
    payload = {
        "name": f"New Candidate {n}",
        "email": f"new{n}@example.com",
        "phone": "5551002000",
        "status": "New",
        "primary_skill": "Python",
    }
    payload.update(overrides)
    return payload


# --- Status normalization ---

def test_candidate_status_normalization_unit():
    assert normalize_candidate_status("Bench") == "Active"
    assert normalize_candidate_status("Do Not Contact") == "Inactive"
    assert normalize_candidate_status("WeirdFutureStatus") == "Active"
    assert normalize_candidate_status(None) == "Active"


def test_list_returns_status_display(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, status="Bench")
    res = client.get("/api/candidates/")
    assert res.status_code == 200
    item = res.json()["items"][0]
    assert item["status"] == "Bench"
    assert item["status_display"] == "Active"


# --- Role scoping ---

def test_admin_sees_org_candidates(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, created_by="recruiter-a")
    make_employee(db_session, created_by="recruiter-b")
    assert client.get("/api/candidates/").json()["total"] == 2


def test_recruiter_sees_only_scoped(client, db_session, as_role):
    make_employee(db_session, created_by="recruiter-a", name="Mine")
    make_employee(db_session, created_by="other", name="Other")
    as_role("recruiter", "recruiter-a")
    body = client.get("/api/candidates/").json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "Mine"


def test_read_only_cannot_mutate(client, db_session, as_role, monkeypatch):
    import ats_auth
    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    as_role("read_only")
    res = client.post("/api/candidates/", json=candidate_payload())
    assert res.status_code in (401, 403)


def test_unauthorized_access_returns_401_or_403(client, db_session, as_role, monkeypatch):
    import ats_auth
    from fastapi import HTTPException
    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    app.dependency_overrides.pop(get_current_ats_user, None)

    def _deny(request=None):
        raise HTTPException(status_code=401, detail="Unauthorized")

    monkeypatch.setattr(ats_auth, "get_current_ats_user", _deny)
    app.dependency_overrides[get_current_ats_user] = lambda: (_ for _ in ()).throw(HTTPException(401, "Unauthorized"))
    res = client.get("/api/candidates/")
    assert res.status_code in (401, 403)


# --- Search / filters / sort / pagination ---

def test_search_by_name(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, name="Alice Wonder")
    make_employee(db_session, name="Bob Builder")
    res = client.get("/api/candidates/", params={"q": "Alice"})
    assert res.json()["total"] == 1
    assert "Alice" in res.json()["items"][0]["name"]


def test_search_by_email(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, email="unique.alice@example.com")
    make_employee(db_session, email="bob@example.com")
    res = client.get("/api/candidates/", params={"email": "unique.alice"})
    assert res.json()["total"] == 1


def test_skills_filter(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, primary_skill="Java", secondary_skills="Spring")
    make_employee(db_session, primary_skill="Python")
    res = client.get("/api/candidates/", params={"skills": "Java"})
    assert res.json()["total"] == 1


def test_status_group_filter(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, status="Active")
    make_employee(db_session, status="Bench")
    make_employee(db_session, status="Inactive")
    res = client.get("/api/candidates/", params={"status_group": "active"})
    assert res.json()["total"] == 2


def test_work_authorization_filter(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, work_authorization="US Citizen")
    make_employee(db_session, work_authorization="H1B")
    res = client.get("/api/candidates/", params={"work_authorization": "H1B"})
    assert res.json()["total"] == 1


def test_resume_present_filter(client, db_session, as_role):
    as_role("admin")
    e1 = make_employee(db_session)
    e2 = make_employee(db_session)
    make_resume(db_session, e1.id)
    with_resume = client.get("/api/candidates/", params={"has_resume": True}).json()
    without = client.get("/api/candidates/", params={"has_resume": False}).json()
    assert with_resume["total"] == 1
    assert without["total"] == 1
    assert with_resume["items"][0]["id"] == e1.id
    assert without["items"][0]["id"] == e2.id


def test_submission_present_filter(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    e1 = make_employee(db_session)
    e2 = make_employee(db_session)
    db_session.add(Submission(job_requirement_id=job.id, employee_id=e1.id, status="Submitted", created_by="user-1"))
    db_session.commit()
    res = client.get("/api/candidates/", params={"has_submissions": True})
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["id"] == e1.id
    assert e2.id not in [i["id"] for i in res.json()["items"]]


def test_sorting_and_pagination(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, name="Charlie")
    make_employee(db_session, name="Alice")
    make_employee(db_session, name="Bob")
    res = client.get("/api/candidates/", params={"sort": "name", "page": 1, "page_size": 2})
    body = res.json()
    assert body["page_size"] == 2
    assert body["total"] == 3
    assert body["total_pages"] == 2
    assert body["items"][0]["name"] == "Alice"


def test_empty_state_response(client, db_session, as_role):
    as_role("admin")
    res = client.get("/api/candidates/")
    assert res.status_code == 200
    assert res.json()["items"] == []
    assert res.json()["total"] == 0


def test_list_does_not_expose_resume_text(client, db_session, as_role):
    as_role("admin")
    e = make_employee(db_session)
    make_resume(db_session, e.id, resume_text="SECRET_RESUME_BODY")
    item = client.get("/api/candidates/").json()["items"][0]
    assert "resume_text" not in item
    assert "SECRET_RESUME_BODY" not in str(item)


# --- Counts ---

def test_candidate_counts(client, db_session, as_role):
    as_role("admin")
    emp = make_employee(db_session)
    job = make_job(db_session)
    make_resume(db_session, emp.id)
    db_session.add(JobEmployeeSend(job_requirement_id=job.id, employee_id=emp.id, delivery_status="Draft"))
    sub = Submission(job_requirement_id=job.id, employee_id=emp.id, status="Submitted", created_by="user-1")
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    db_session.add(Interview(submission_id=sub.id, status="Scheduled", created_by="user-1"))
    db_session.add(Offer(submission_id=sub.id, status="Extended", created_by="user-1"))
    db_session.commit()

    body = client.get(f"/api/candidates/{emp.id}/counts").json()
    assert body["resumes"] == 1
    assert body["matches"] == 1
    assert body["active_submissions"] == 1
    assert body["interviews"] == 1
    assert body["offers"] == 1


# --- Duplicates ---

def test_exact_email_duplicate_detection(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, email="dup@example.com")
    res = client.post("/api/candidates/check-duplicates", json={"email": "dup@example.com"})
    assert res.status_code == 200
    body = res.json()
    assert body["blocked"] is True
    assert body["matches"][0]["match_reason"] == "email"


def test_exact_phone_duplicate_detection(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, phone="(555) 999-8888")
    res = client.post("/api/candidates/check-duplicates", json={"phone": "5559998888"})
    assert res.json()["blocked"] is True
    assert res.json()["matches"][0]["match_reason"] == "phone"


def test_possible_duplicate_warning_on_create(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, email="exists@example.com")
    res = client.post("/api/candidates/", json=candidate_payload(email="exists@example.com"))
    assert res.status_code == 409
    detail = res.json()["detail"]
    assert "possible existing candidate" in detail["message"].lower()


# --- Resume versioning / primary / delete guards ---

def test_resume_upload_links_and_primary(client, db_session, as_role, tmp_path, monkeypatch):
    as_role("admin")
    emp = make_employee(db_session)
    r1 = make_resume(db_session, emp.id, is_primary=True, version_number=1)
    r2 = make_resume(db_session, emp.id, is_primary=False, version_number=2, filename="v2.pdf")
    assert r1.is_primary and not r2.is_primary

    res = client.post(f"/api/candidates/{emp.id}/resumes/{r2.id}/primary")
    assert res.status_code == 200
    assert res.json()["is_primary"] is True
    db_session.refresh(r1)
    assert r1.is_primary is False


def test_dependent_resume_deletion_archives(client, db_session, as_role):
    as_role("admin")
    emp = make_employee(db_session)
    resume = make_resume(db_session, emp.id)
    job = make_job(db_session)
    db_session.add(Submission(job_requirement_id=job.id, employee_id=emp.id, status="Submitted", created_by="user-1"))
    db_session.commit()

    res = client.delete(f"/api/candidates/{emp.id}/resumes/{resume.id}")
    assert res.status_code == 200
    assert res.json().get("archived") is True
    db_session.refresh(resume)
    assert resume.parsing_status == "archived"


def test_candidate_with_submissions_cannot_hard_delete(client, db_session, as_role):
    as_role("admin")
    emp = make_employee(db_session, status="New")
    job = make_job(db_session)
    db_session.add(Submission(job_requirement_id=job.id, employee_id=emp.id, status="Submitted", created_by="user-1"))
    db_session.commit()
    res = client.delete(f"/api/candidates/{emp.id}")
    assert res.status_code == 409


def test_parse_resume_requires_writer(client, db_session, as_role, monkeypatch):
    import ats_auth
    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    as_role("read_only")
    res = client.post(
        "/api/candidates/parse-resume",
        files={"file": ("resume.txt", b"Alice\nalice@example.com\nPython", "text/plain")},
    )
    assert res.status_code in (401, 403)


# --- Matching ---

def test_job_matching_saves_without_duplication(client, db_session, as_role):
    as_role("admin")
    emp = make_employee(db_session, status="Active", primary_skill="Python")
    job = make_job(db_session, status="Open", required_skills='["Python"]')
    make_resume(db_session, emp.id, parsed_primary_skill="Python", parsed_skills='["Python"]')

    r1 = client.post(f"/api/candidates/{emp.id}/matches", json={"job_ids": [job.id], "save": True})
    assert r1.status_code == 200
    assert len(r1.json()) >= 1
    r2 = client.post(f"/api/candidates/{emp.id}/matches", json={"job_ids": [job.id], "save": True})
    assert r2.status_code == 200
    sends = db_session.query(JobEmployeeSend).filter(
        JobEmployeeSend.employee_id == emp.id,
        JobEmployeeSend.job_requirement_id == job.id,
    ).count()
    assert sends == 1


def test_employees_alias_still_works(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, name="Legacy Path")
    res = client.get("/api/employees/")
    assert res.status_code == 200
    assert res.json()["total"] == 1


def test_dashboard_active_count_matches_status_group(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, status="Active")
    make_employee(db_session, status="Bench")
    make_employee(db_session, status="Inactive")
    dash = client.get("/api/dashboard/summary").json()["counts"]["active_candidates"]
    filt = client.get("/api/candidates/", params={"status_group": "active"}).json()["total"]
    assert dash == filt == 2
