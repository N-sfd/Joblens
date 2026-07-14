"""Unified Jobs module: status normalization, filters/sort/pagination, role
scoping, CRM linking, counts, and delete guards."""

from datetime import datetime, timedelta

import pytest

from ats_auth import AtsPrincipal, get_current_ats_user
from main import app
from models import (
    CRMActivity,
    CRMContact,
    CRMOrganization,
    Employee,
    ImportedEmail,
    Interview,
    JobEmployeeSend,
    JobRequirement,
    Submission,
    ZohoConnection,
)


def _principal(role: str, user_id: str = "user-1") -> AtsPrincipal:
    p = AtsPrincipal(user_id=user_id, claims={})
    p._resolved_role = role
    return p


@pytest.fixture()
def as_role(client, monkeypatch):
    """Set the active ATS principal for one test.

    `require_writer`/`require_admin` call `ats_auth.get_current_ats_user`
    directly (not via FastAPI's DI), so a plain `dependency_overrides` entry
    doesn't reach them — monkeypatch the module function itself so both
    FastAPI-injected and directly-called sites see the same fake principal.
    """
    def _set(role: str, user_id: str = "user-1"):
        principal = _principal(role, user_id)
        import ats_auth
        monkeypatch.setattr(ats_auth, "get_current_ats_user", lambda request=None: principal)
        app.dependency_overrides[get_current_ats_user] = lambda: principal
    yield _set
    app.dependency_overrides.pop(get_current_ats_user, None)


def make_job(db, **overrides):
    defaults = dict(job_title="Backend Engineer", status="Open", source="Manual", created_by="user-1")
    defaults.update(overrides)
    job = JobRequirement(**defaults)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


_emp_seq = [0]


def make_employee(db, **overrides):
    _emp_seq[0] += 1
    defaults = dict(name="Jamie Candidate", email=f"jamie{_emp_seq[0]}@example.com", status="Active")
    defaults.update(overrides)
    emp = Employee(**defaults)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def job_payload(**overrides):
    payload = {
        "job_title": "Senior Backend Engineer",
        "vendor": "Staffing Co",
        "recruiter_name": "Pat Recruiter",
        "recruiter_email": "pat@staffingco.example",
        "job_description": "Build backend services.",
        "status": "Open",
        "source": "Manual",
    }
    payload.update(overrides)
    return payload


# --- 1-3: role access ---

def test_admin_sees_all_jobs(client, db_session, as_role):
    make_job(db_session, job_title="Mine", created_by="recruiter-a")
    make_job(db_session, job_title="Theirs", created_by="recruiter-b")
    as_role("admin", user_id="admin-1")
    res = client.get("/api/job-requirements/")
    assert res.status_code == 200
    assert res.json()["total"] == 2


def test_recruiter_sees_only_own_jobs(client, db_session, as_role):
    make_job(db_session, job_title="Mine", created_by="recruiter-a")
    make_job(db_session, job_title="Theirs", created_by="recruiter-b")
    as_role("recruiter", user_id="recruiter-a")
    res = client.get("/api/job-requirements/")
    body = res.json()
    assert body["total"] == 1
    assert body["items"][0]["job_title"] == "Mine"


def test_recruiter_cannot_view_others_job_detail(client, db_session, as_role):
    job = make_job(db_session, created_by="recruiter-b")
    as_role("recruiter", user_id="recruiter-a")
    res = client.get(f"/api/job-requirements/{job.id}")
    assert res.status_code == 404


def test_read_only_cannot_create_job(client, db_session, as_role, monkeypatch):
    import ats_auth
    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    as_role("read_only", user_id="viewer-1")
    res = client.post("/api/job-requirements/", json=job_payload())
    assert res.status_code == 403


def test_read_only_cannot_change_status(client, db_session, as_role, monkeypatch):
    import ats_auth
    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    job = make_job(db_session)
    as_role("read_only", user_id="viewer-1")
    res = client.patch(f"/api/job-requirements/{job.id}/status", json={"status": "Closed"})
    assert res.status_code == 403


def test_read_only_can_still_view_jobs(client, db_session, as_role):
    make_job(db_session)
    as_role("read_only", user_id="viewer-1")
    res = client.get("/api/job-requirements/")
    assert res.status_code == 200


# --- 4: search ---

def test_search_by_title_and_recruiter(client, db_session, as_role):
    as_role("admin")
    make_job(db_session, job_title="Platform Engineer", recruiter_name="Alex Recruiter")
    make_job(db_session, job_title="Data Scientist", recruiter_name="Sam Recruiter")

    res = client.get("/api/job-requirements/", params={"q": "Platform"})
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["job_title"] == "Platform Engineer"

    res2 = client.get("/api/job-requirements/", params={"q": "Sam"})
    assert res2.json()["total"] == 1
    assert res2.json()["items"][0]["job_title"] == "Data Scientist"


# --- 5: exact status filtering ---

def test_exact_status_filter(client, db_session, as_role):
    as_role("admin")
    make_job(db_session, job_title="Open One", status="Open")
    make_job(db_session, job_title="Closed One", status="Closed")
    res = client.get("/api/job-requirements/", params={"status": "Closed"})
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["job_title"] == "Closed One"


# --- 6: status-group filtering matches dashboard ---

def test_status_group_open_matches_dashboard_definition(client, db_session, as_role):
    as_role("admin")
    make_job(db_session, job_title="Open Role", status="Open")
    make_job(db_session, job_title="On Hold Role", status="On Hold")
    make_job(db_session, job_title="Draft Role", status="New")
    make_job(db_session, job_title="Filled Role", status="Selected")
    make_job(db_session, job_title="Closed Role", status="Closed")

    jobs_res = client.get("/api/job-requirements/", params={"status_group": "open"})
    dash_res = client.get("/api/dashboard/summary")

    assert jobs_res.json()["total"] == 2
    titles = {j["job_title"] for j in jobs_res.json()["items"]}
    assert titles == {"Open Role", "On Hold Role"}
    assert dash_res.json()["counts"]["open_jobs"] == jobs_res.json()["total"]


def test_status_group_filled_and_closed(client, db_session, as_role):
    as_role("admin")
    make_job(db_session, job_title="Filled Role", status="Selected")
    make_job(db_session, job_title="Closed Role", status="Closed")
    make_job(db_session, job_title="Spam Role", status="Spam")

    filled = client.get("/api/job-requirements/", params={"status_group": "Filled"})
    assert filled.json()["total"] == 1

    closed = client.get("/api/job-requirements/", params={"status_group": "Closed"})
    assert closed.json()["total"] == 2  # Closed + Spam both normalize to Closed


# --- 7: zoho-source filtering ---

def test_source_filter_zoho(client, db_session, as_role):
    as_role("admin")
    make_job(db_session, job_title="Zoho Job", source="Zoho Mail")
    make_job(db_session, job_title="Manual Job", source="Manual")
    res = client.get("/api/job-requirements/", params={"source": "zoho"})
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["source_label"] == "Zoho Email"
    assert res.json()["items"][0]["job_title"] == "Zoho Job"


# --- 8: date filtering ---

def test_created_within_days_filter(client, db_session, as_role):
    as_role("admin")
    make_job(db_session, job_title="Fresh", source="Zoho Mail", created_at=datetime.utcnow())
    make_job(db_session, job_title="Stale", source="Zoho Mail", created_at=datetime.utcnow() - timedelta(days=30))
    res = client.get("/api/job-requirements/", params={"created_within_days": 7})
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["job_title"] == "Fresh"


# --- 9: sorting ---

def test_sort_by_job_title(client, db_session, as_role):
    as_role("admin")
    make_job(db_session, job_title="Zebra Role")
    make_job(db_session, job_title="Alpha Role")
    res = client.get("/api/job-requirements/", params={"sort": "job_title"})
    titles = [j["job_title"] for j in res.json()["items"]]
    assert titles == ["Alpha Role", "Zebra Role"]


def test_default_sort_is_last_activity(client, db_session, as_role):
    as_role("admin")
    older = make_job(db_session, job_title="Older Activity")
    newer = make_job(db_session, job_title="Newer Activity")
    db_session.add(CRMActivity(activity_type="Note", job_requirement_id=older.id, activity_date=datetime.utcnow() - timedelta(days=5)))
    db_session.add(CRMActivity(activity_type="Note", job_requirement_id=newer.id, activity_date=datetime.utcnow()))
    db_session.commit()

    res = client.get("/api/job-requirements/")
    titles = [j["job_title"] for j in res.json()["items"]]
    assert titles[0] == "Newer Activity"


# --- 10: pagination ---

def test_pagination(client, db_session, as_role):
    as_role("admin")
    for i in range(5):
        make_job(db_session, job_title=f"Job {i}")
    res = client.get("/api/job-requirements/", params={"page": 1, "page_size": 2})
    body = res.json()
    assert len(body["items"]) == 2
    assert body["total"] == 5
    assert body["total_pages"] == 3


# --- 11-13: counts ---

def test_candidate_and_submission_and_interview_counts(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp1 = make_employee(db_session)
    emp2 = make_employee(db_session)
    db_session.add(JobEmployeeSend(job_requirement_id=job.id, employee_id=emp1.id, delivery_status="Sent"))
    db_session.commit()
    sub = Submission(job_requirement_id=job.id, employee_id=emp2.id, status="Submitted")
    db_session.add(sub)
    db_session.commit()
    db_session.refresh(sub)
    db_session.add(Interview(submission_id=sub.id, status="Scheduled"))
    db_session.commit()

    res = client.get(f"/api/job-requirements/{job.id}")
    body = res.json()
    assert body["candidate_count"] == 2  # emp1 via send, emp2 via submission
    assert body["submission_count"] == 1
    assert body["interview_count"] == 1


# --- 14-15: recruiter/company linking prevents duplicates ---

def test_recruiter_linking_prevents_duplicates(client, db_session, as_role):
    as_role("admin")
    r1 = client.post("/api/job-requirements/", json=job_payload(job_title="Job One"))
    r2 = client.post("/api/job-requirements/", json=job_payload(job_title="Job Two", recruiter_email="PAT@StaffingCo.example"))
    assert r1.status_code == 201 and r2.status_code == 201
    assert r1.json()["recruiter_contact_id"] == r2.json()["recruiter_contact_id"]
    assert db_session.query(CRMContact).count() == 1


def test_company_linking_prevents_duplicates(client, db_session, as_role):
    as_role("admin")
    r1 = client.post("/api/job-requirements/", json=job_payload(job_title="Job One", vendor="Acme Staffing", recruiter_email="a@acme.example"))
    r2 = client.post("/api/job-requirements/", json=job_payload(job_title="Job Two", vendor="Acme Staffing", recruiter_email="b@acme.example"))
    assert r1.json()["vendor_id"] == r2.json()["vendor_id"]
    assert db_session.query(CRMOrganization).count() == 1


def test_recruiter_link_status_incomplete_without_recruiter_contact(client, db_session, as_role):
    as_role("admin")
    res = client.post("/api/job-requirements/", json=job_payload(recruiter_name=None, recruiter_email=None))
    assert res.json()["recruiter_contact_id"] is None
    assert res.json()["recruiter_link_status"] == "incomplete"


def test_recruiter_link_status_linked_when_created(client, db_session, as_role):
    as_role("admin")
    res = client.post("/api/job-requirements/", json=job_payload())
    assert res.json()["recruiter_link_status"] == "linked"


# --- 16: zoho message id prevents duplicate jobs (cross-check with zoho.py) ---

def test_zoho_duplicate_email_import_does_not_duplicate_job(client, db_session, as_role):
    as_role("admin", user_id="user-1")
    conn = ZohoConnection(user_id="user-1", status="Active")
    db_session.add(conn)
    db_session.commit()
    db_session.refresh(conn)
    email = ImportedEmail(
        zoho_connection_id=conn.id, zoho_message_id="dup-msg-1",
        from_address="pat@staffingco.example", from_name="Pat Recruiter",
        subject="Backend role", body_text="We need a backend engineer.",
        classification="job_req", needs_review=True,
    )
    db_session.add(email)
    db_session.commit()
    db_session.refresh(email)

    first = client.post(f"/api/zoho/emails/{email.id}/create-job", json=job_payload())
    assert first.status_code == 201
    second = client.post(f"/api/zoho/emails/{email.id}/create-job", json=job_payload())
    assert second.status_code == 409

    jobs = client.get("/api/job-requirements/").json()
    assert jobs["total"] == 1


# --- 17: job detail returns related counts and summary data ---

def test_job_detail_returns_summary_fields(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session, job_title="Detail Job")
    res = client.get(f"/api/job-requirements/{job.id}")
    body = res.json()
    for field in ("status_display", "source_label", "candidate_count", "submission_count", "interview_count", "offer_count", "placement_count"):
        assert field in body


# --- 18: closed jobs remain viewable ---

def test_closed_job_remains_viewable(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session, status="Closed")
    res = client.get(f"/api/job-requirements/{job.id}")
    assert res.status_code == 200
    assert res.json()["status_display"] == "Closed"


# --- 19: dependent records block hard delete ---

def test_delete_blocked_when_job_has_submissions(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session)
    db_session.add(Submission(job_requirement_id=job.id, employee_id=emp.id, status="Submitted"))
    db_session.commit()
    res = client.delete(f"/api/job-requirements/{job.id}", params={"confirm": True})
    assert res.status_code == 409


def test_delete_blocked_without_confirmation(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session, status="New")  # Draft-equivalent, no dependents
    res = client.delete(f"/api/job-requirements/{job.id}")
    assert res.status_code == 409


def test_delete_blocked_for_non_draft(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session, status="Open")
    res = client.delete(f"/api/job-requirements/{job.id}", params={"confirm": True})
    assert res.status_code == 409


def test_delete_allowed_for_draft_with_no_dependents_and_confirmation(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session, status="New")
    res = client.delete(f"/api/job-requirements/{job.id}", params={"confirm": True})
    assert res.status_code == 200
    assert db_session.query(JobRequirement).filter(JobRequirement.id == job.id).first() is None


# --- 20: unauthorized access ---

def test_unauthorized_no_token_rejected(client, db_session, monkeypatch):
    import ats_auth
    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    res = client.get("/api/job-requirements/")
    assert res.status_code == 401


# --- 21: sensitive data not exposed ---

def test_job_list_does_not_expose_raw_email_or_resume_fields(client, db_session, as_role):
    as_role("admin")
    make_job(db_session, raw_email_text="Subject: secret\nFrom: pat@x.com\n\nSensitive body content here.")
    res = client.get("/api/job-requirements/")
    raw = res.text
    for forbidden in ("resume_text", "body_html", "password", "access_token", "refresh_token"):
        assert forbidden not in raw


# --- 22: empty state ---

def test_empty_state_no_jobs(client, db_session, as_role):
    as_role("admin")
    res = client.get("/api/job-requirements/")
    body = res.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["total_pages"] == 1
