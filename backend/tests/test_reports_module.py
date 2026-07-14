"""Phase 7 Reports module — scope, date presets, dashboard parity, CSV export."""

from datetime import datetime, timedelta

import pytest

from ats_auth import AtsPrincipal, get_current_ats_user
from main import app
from models import (
    CRMActivity,
    Employee,
    Interview,
    JobRequirement,
    Submission,
)


def _principal(role: str, user_id: str = "user-1") -> AtsPrincipal:
    p = AtsPrincipal(user_id=user_id, claims={})
    p._resolved_role = role
    return p


@pytest.fixture()
def as_role(client):
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


def _seed_parity_data(db):
    """Shared fixtures that exercise dashboard + report snapshot tiles."""
    job = make_job(db, job_title="Open Role", status="Open", created_by="user-1")
    make_job(db, job_title="Draft Role", status="New", created_by="user-1")
    make_job(db, job_title="Other Open", status="Open", created_by="recruiter-b")

    emp = make_employee(db, created_by="user-1")
    make_submission(db, job, emp, status="Submitted", created_by="user-1")
    make_submission(db, job, emp, status="Submitted", created_by="user-1")
    make_submission(db, job, emp, status="Offer", created_by="user-1")
    make_submission(db, job, emp, status="Selected", created_by="user-1")

    sub_iv1 = make_submission(db, job, emp, status="Interview", created_by="user-1")
    sub_iv2 = make_submission(db, job, emp, status="Interview", created_by="user-1")
    db.add(Interview(submission_id=sub_iv1.id, status="Scheduled", created_by="user-1"))
    db.add(Interview(submission_id=sub_iv2.id, status="Completed", created_by="user-1"))

    now = datetime.utcnow()
    db.add(CRMActivity(
        activity_type="Follow-Up", subject="Call vendor", status="Open",
        due_date=now - timedelta(days=1), created_by="user-1",
    ))
    db.add(CRMActivity(
        activity_type="Follow-Up", subject="Check in", status="Open",
        due_date=now + timedelta(days=2), created_by="user-1",
    ))
    db.commit()
    return job, emp


def test_unauthorized_with_enforce(client, db_session, monkeypatch):
    import ats_auth
    monkeypatch.setattr(ats_auth, "ENFORCE", True)
    res = client.get("/api/reports/overview")
    assert res.status_code == 401


def test_admin_vs_recruiter_scope(client, db_session, as_role):
    make_job(db_session, job_title="Mine", created_by="recruiter-a")
    make_job(db_session, job_title="Theirs", created_by="recruiter-b")

    as_role("recruiter", user_id="recruiter-a")
    rec = client.get("/api/reports/overview").json()
    assert rec["scope"] == "own"
    assert rec["summary"]["open_jobs"] == 1

    as_role("admin", user_id="admin-1")
    adm = client.get("/api/reports/overview").json()
    assert adm["scope"] == "organization"
    assert adm["summary"]["open_jobs"] == 2


def test_default_preset_last_30_days(client, db_session, as_role):
    as_role("admin")
    res = client.get("/api/reports/overview")
    assert res.status_code == 200
    body = res.json()
    assert body["date_range"]["preset"] == "last_30_days"
    assert body["date_range"]["date_from"] is not None
    assert body["date_range"]["date_to"] is not None


def test_invalid_date_range_422(client, db_session, as_role):
    as_role("admin")
    res = client.get(
        "/api/reports/overview",
        params={"preset": "custom", "date_from": "2026-06-01", "date_to": "2026-05-01"},
    )
    assert res.status_code == 422


def test_parity_open_jobs_with_dashboard(client, db_session, as_role):
    _seed_parity_data(db_session)
    as_role("admin")
    dash = client.get("/api/dashboard/summary").json()["counts"]
    report = client.get("/api/reports/overview").json()["summary"]
    assert report["open_jobs"] == dash["open_jobs"]


def test_parity_submitted_with_dashboard(client, db_session, as_role):
    _seed_parity_data(db_session)
    as_role("admin")
    dash = client.get("/api/dashboard/summary").json()["counts"]
    report = client.get("/api/reports/overview").json()["summary"]
    assert report["candidates_submitted_current"] == dash["candidates_submitted"]
    # Same owner path via pipeline report summary
    pipe = client.get("/api/reports/pipeline").json()["summary"]
    assert pipe["submitted"] == dash["candidates_submitted"]


def test_parity_interviews_scheduled_with_dashboard(client, db_session, as_role):
    _seed_parity_data(db_session)
    as_role("admin")
    dash = client.get("/api/dashboard/summary").json()["counts"]
    report = client.get("/api/reports/overview").json()["summary"]
    assert report["interviews_scheduled"] == dash["interviews_scheduled"]
    pipe = client.get("/api/reports/pipeline").json()["summary"]
    assert pipe["interviews_scheduled"] == dash["interviews_scheduled"]


def test_parity_offers_with_dashboard(client, db_session, as_role):
    _seed_parity_data(db_session)
    as_role("admin")
    dash = client.get("/api/dashboard/summary").json()["counts"]
    report = client.get("/api/reports/overview").json()["summary"]
    assert report["offers"] == dash["offers"]


def test_parity_placements_with_dashboard(client, db_session, as_role):
    _seed_parity_data(db_session)
    as_role("admin")
    dash = client.get("/api/dashboard/summary").json()["counts"]
    report = client.get("/api/reports/overview").json()["summary"]
    assert report["placements"] == dash["placements"]


def test_parity_follow_ups_due_with_dashboard(client, db_session, as_role):
    _seed_parity_data(db_session)
    as_role("admin")
    dash = client.get("/api/dashboard/summary").json()["counts"]
    report = client.get("/api/reports/overview").json()["summary"]
    assert report["follow_ups_due"] == dash["follow_ups_due"]
    fu = client.get("/api/reports/follow-ups").json()["summary"]
    assert fu["follow_ups_due"] == dash["follow_ups_due"]


def test_conversion_zero_denominator(client, db_session, as_role):
    as_role("admin")
    res = client.get("/api/reports/pipeline")
    assert res.status_code == 200
    conversion = res.json()["sections"]["conversion"]
    assert conversion
    for row in conversion:
        assert row["rate_pct"] == 0.0
        assert row["from_count"] == 0


def test_csv_export_text_csv_excludes_resume_text(client, db_session, as_role):
    as_role("admin")
    job = make_job(db_session)
    emp = make_employee(db_session, notes="secret notes")
    make_submission(db_session, job, emp)
    res = client.get("/api/reports/export", params={"report_type": "overview", "format": "csv"})
    assert res.status_code == 200
    assert "text/csv" in res.headers.get("content-type", "")
    assert "attachment" in res.headers.get("content-disposition", "").lower()
    body = res.text.lower()
    assert "resume_text" not in body
    assert "body_html" not in body
    assert "access_token" not in body


def test_empty_data_returns_empty_rows_not_error(client, db_session, as_role):
    as_role("admin")
    for path in (
        "/api/reports/overview",
        "/api/reports/jobs",
        "/api/reports/candidates",
        "/api/reports/pipeline",
        "/api/reports/contacts",
        "/api/reports/activity",
        "/api/reports/follow-ups",
    ):
        res = client.get(path)
        assert res.status_code == 200, path
        body = res.json()
        assert "sections" in body
        assert isinstance(body.get("rows", []), list)

    # Activity/follow-ups explicitly empty rows
    assert client.get("/api/reports/activity").json()["rows"] == []
    assert client.get("/api/reports/follow-ups").json()["rows"] == []


def test_recruiter_parity_same_owner(client, db_session, as_role):
    _seed_parity_data(db_session)
    as_role("recruiter", user_id="user-1")
    dash = client.get("/api/dashboard/summary").json()["counts"]
    report = client.get("/api/reports/overview").json()["summary"]
    assert report["open_jobs"] == dash["open_jobs"]
    assert report["candidates_submitted_current"] == dash["candidates_submitted"]
    assert report["interviews_scheduled"] == dash["interviews_scheduled"]
    assert report["offers"] == dash["offers"]
    assert report["placements"] == dash["placements"]
    assert report["follow_ups_due"] == dash["follow_ups_due"]
