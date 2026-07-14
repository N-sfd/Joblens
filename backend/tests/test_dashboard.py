"""Unified Recruitment CRM + ATS dashboard: counts, scoping, and edge cases."""

from datetime import datetime, timedelta

import pytest

from ats_auth import AtsPrincipal, get_current_ats_user
from main import app
from models import (
    CRMActivity,
    CRMContact,
    CRMOrganization,
    Employee,
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
def as_role(client):
    """Override the ATS auth dependency to a fixed role/user for one test."""
    def _set(role: str, user_id: str = "user-1"):
        app.dependency_overrides[get_current_ats_user] = lambda: _principal(role, user_id)
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


_employee_seq = [0]


def make_employee(db, **overrides):
    _employee_seq[0] += 1
    defaults = dict(
        name="Jamie Candidate",
        email=f"jamie{_employee_seq[0]}@example.com",
        status="Active",
        created_by="user-1",
    )
    defaults.update(overrides)
    emp = Employee(**defaults)
    db.add(emp)
    db.commit()
    db.refresh(emp)
    return emp


def make_submission(db, job, emp, **overrides):
    defaults = dict(job_requirement_id=job.id, employee_id=emp.id, status="Submitted", created_by="user-1")
    defaults.update(overrides)
    sub = Submission(**defaults)
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def test_dashboard_empty_state(client, db_session, as_role):
    as_role("admin")
    res = client.get("/api/dashboard/summary")
    assert res.status_code == 200
    body = res.json()
    assert body["counts"] == {
        "open_jobs": 0, "new_zoho_jobs": 0, "active_candidates": 0,
        "candidates_submitted": 0, "interviews_scheduled": 0, "offers": 0,
        "placements": 0, "follow_ups_due": 0,
    }
    assert body["recent_activities"] == []
    assert body["follow_ups_due"] == []
    assert body["recent_zoho_jobs"] == []
    assert body["zoho_connected"] is False
    assert len(body["pipeline"]) == 11
    assert all(stage["count"] == 0 for stage in body["pipeline"])


def test_open_jobs_excludes_closed_statuses(client, db_session, as_role):
    as_role("admin")
    make_job(db_session, job_title="Open Role", status="Open")
    make_job(db_session, job_title="New Role", status="New")
    make_job(db_session, job_title="Closed Role", status="Closed")
    make_job(db_session, job_title="Duplicate Role", status="Duplicate")

    res = client.get("/api/dashboard/summary")
    assert res.json()["counts"]["open_jobs"] == 2


def test_new_zoho_jobs_within_window(client, db_session, as_role):
    as_role("admin")
    make_job(db_session, job_title="Fresh Zoho Job", source="Zoho Mail", created_at=datetime.utcnow())
    make_job(
        db_session, job_title="Stale Zoho Job", source="Zoho Mail",
        created_at=datetime.utcnow() - timedelta(days=30),
    )
    make_job(db_session, job_title="Manual Job", source="Manual", created_at=datetime.utcnow())

    res = client.get("/api/dashboard/summary")
    assert res.json()["counts"]["new_zoho_jobs"] == 1


def test_active_candidates_count(client, db_session, as_role):
    as_role("admin")
    make_employee(db_session, name="Active One", status="Active")
    make_employee(db_session, name="Active Two", status="Active")
    make_employee(db_session, name="Bench One", status="Bench")

    res = client.get("/api/dashboard/summary")
    assert res.json()["counts"]["active_candidates"] == 2


def test_submission_stage_counts_and_pipeline_mapping(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session)
    make_submission(db_session, job, emp, status="Draft")
    make_submission(db_session, job, emp, status="Submitted")
    make_submission(db_session, job, emp, status="Submitted")
    make_submission(db_session, job, emp, status="Selected")

    res = client.get("/api/dashboard/summary")
    body = res.json()
    assert body["counts"]["candidates_submitted"] == 3  # Submitted x2 + Selected x1
    assert body["counts"]["placements"] == 1

    pipeline = {s["stage"]: s["count"] for s in body["pipeline"]}
    assert pipeline["Identified"] == 1
    assert pipeline["Submitted"] == 2
    assert pipeline["Placed"] == 1


def test_interview_stage_split_scheduled_vs_completed(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session)
    sub1 = make_submission(db_session, job, emp, status="Interview")
    sub2 = make_submission(db_session, job, emp, status="Interview")
    db_session.add(Interview(submission_id=sub1.id, status="Scheduled", created_by="user-1"))
    db_session.add(Interview(submission_id=sub2.id, status="Completed", created_by="user-1"))
    db_session.commit()

    res = client.get("/api/dashboard/summary")
    body = res.json()
    assert body["counts"]["interviews_scheduled"] == 1
    pipeline = {s["stage"]: s["count"] for s in body["pipeline"]}
    assert pipeline["Interview Scheduled"] == 1
    assert pipeline["Interview Completed"] == 1


def test_offers_count_active_only(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session)
    sub = make_submission(db_session, job, emp, status="Offer")
    db_session.add(Offer(submission_id=sub.id, status="Extended", created_by="user-1"))
    db_session.add(Offer(submission_id=sub.id, status="Declined", created_by="user-1"))
    db_session.commit()

    res = client.get("/api/dashboard/summary")
    assert res.json()["counts"]["offers"] == 1


def test_follow_ups_due_overdue_flag_and_ordering(client, db_session, as_role):
    as_role("admin")
    now = datetime.utcnow()
    overdue = CRMActivity(
        activity_type="Follow-Up", subject="Call back vendor", status="Open",
        due_date=now - timedelta(days=2), created_by="user-1",
    )
    upcoming = CRMActivity(
        activity_type="Follow-Up", subject="Check in with candidate", status="Open",
        due_date=now + timedelta(days=3), created_by="user-1",
    )
    done = CRMActivity(
        activity_type="Follow-Up", subject="Already handled", status="Done",
        due_date=now - timedelta(days=1), created_by="user-1",
    )
    db_session.add_all([overdue, upcoming, done])
    db_session.commit()

    res = client.get("/api/dashboard/summary")
    body = res.json()
    assert body["counts"]["follow_ups_due"] == 2  # excludes the Done one
    items = body["follow_ups_due"]
    assert items[0]["subject"] == "Call back vendor"
    assert items[0]["overdue"] is True
    assert items[1]["subject"] == "Check in with candidate"
    assert items[1]["overdue"] is False


def test_recent_activity_order_and_links(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session, job_title="Linked Job")
    older = CRMActivity(
        activity_type="Note", subject="Older", job_requirement_id=job.id,
        activity_date=datetime.utcnow() - timedelta(hours=2), created_by="user-1",
    )
    newer = CRMActivity(
        activity_type="Job Received", subject="Newer", job_requirement_id=job.id,
        activity_date=datetime.utcnow(), created_by="user-1",
    )
    db_session.add_all([older, newer])
    db_session.commit()

    res = client.get("/api/dashboard/summary")
    items = res.json()["recent_activities"]
    assert items[0]["subject"] == "Newer"
    assert items[1]["subject"] == "Older"
    assert items[0]["job_title"] == "Linked Job"


def test_recruiter_sees_only_own_records(client, db_session, as_role):
    make_job(db_session, job_title="Mine", created_by="recruiter-a")
    make_job(db_session, job_title="Someone Else's", created_by="recruiter-b")

    as_role("recruiter", user_id="recruiter-a")
    res = client.get("/api/dashboard/summary")
    body = res.json()
    assert body["scope"] == "own"
    assert body["counts"]["open_jobs"] == 1


def test_admin_sees_organization_wide_records(client, db_session, as_role):
    make_job(db_session, job_title="Mine", created_by="recruiter-a")
    make_job(db_session, job_title="Someone Else's", created_by="recruiter-b")

    as_role("admin", user_id="admin-1")
    res = client.get("/api/dashboard/summary")
    body = res.json()
    assert body["scope"] == "organization"
    assert body["counts"]["open_jobs"] == 2


def test_manager_and_read_only_are_organization_wide(client, db_session, as_role):
    make_job(db_session, job_title="Mine", created_by="recruiter-a")
    make_job(db_session, job_title="Someone Else's", created_by="recruiter-b")

    as_role("manager", user_id="manager-1")
    assert client.get("/api/dashboard/summary").json()["scope"] == "organization"

    as_role("read_only", user_id="viewer-1")
    body = client.get("/api/dashboard/summary").json()
    assert body["scope"] == "organization"
    assert body["counts"]["open_jobs"] == 2


def test_unauthorized_access_rejected(client, db_session, monkeypatch):
    import ats_auth
    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    res = client.get("/api/dashboard/summary")
    assert res.status_code == 401


def test_dashboard_does_not_expose_sensitive_fields(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session, job_title="Sensitive Job")
    contact = CRMContact(first_name="Pat", last_name="Recruiter", email="pat@example.com", normalized_email="pat@example.com")
    db_session.add(contact)
    db_session.commit()
    db_session.add(CRMActivity(
        activity_type="Note", subject="Test", description="Body detail",
        job_requirement_id=job.id, contact_id=contact.id, created_by="user-1",
    ))
    db_session.commit()

    res = client.get("/api/dashboard/summary")
    raw = res.text
    # No raw resume text, email body, or password/token-shaped fields anywhere.
    for forbidden in ("body_text", "body_html", "resume_text", "password", "access_token", "refresh_token"):
        assert forbidden not in raw
