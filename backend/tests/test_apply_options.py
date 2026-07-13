"""Phase 2 Apply Options regression tests."""

from unittest.mock import patch

from models import JobApplication
from conftest import make_published_job


def _count_apps(db, guest_id=None, user_id=None):
    q = db.query(JobApplication)
    if user_id is not None:
        q = q.filter(JobApplication.user_id == user_id)
    elif guest_id is not None:
        q = q.filter(JobApplication.guest_id == guest_id, JobApplication.user_id.is_(None))
    return q.count()


def test_repeated_save_job_no_duplicates(client, db_session, guest_headers):
    job = make_published_job(db_session)
    for _ in range(3):
        r = client.post(
            "/api/jobs/from-external",
            headers=guest_headers,
            json={"job_requirement_id": job.id, "status": "Saved"},
        )
        assert r.status_code in (200, 201), r.text
    assert _count_apps(db_session, guest_id=guest_headers["X-Guest-Id"]) == 1


def test_repeated_apply_now_no_duplicates(client, db_session, guest_headers):
    job = make_published_job(db_session)
    for _ in range(3):
        r = client.post(
            "/api/jobs/from-external",
            headers=guest_headers,
            json={
                "job_requirement_id": job.id,
                "status": "Application Opened",
                "application_method": "employer_website",
            },
        )
        assert r.status_code in (200, 201), r.text
    assert _count_apps(db_session, guest_id=guest_headers["X-Guest-Id"]) == 1
    app_row = db_session.query(JobApplication).one()
    assert app_row.status == "Application Opened"
    assert app_row.application_method == "employer_website"


def test_reopen_does_not_downgrade_protected_statuses(client, db_session, guest_headers):
    protected = ["Applied", "Interviewing", "Offer", "Rejected", "Withdrawn"]
    for status in protected:
        job = make_published_job(db_session, job_title=f"Role {status}")
        create = client.post(
            "/api/jobs/from-external",
            headers=guest_headers,
            json={"job_requirement_id": job.id, "status": "Saved"},
        )
        assert create.status_code in (200, 201)
        app_id = create.json()["id"]
        # Force protected status via direct update endpoint
        upd = client.put(
            f"/api/jobs/{app_id}",
            headers=guest_headers,
            json={"status": status},
        )
        assert upd.status_code == 200, upd.text
        reopen = client.post(
            "/api/jobs/from-external",
            headers=guest_headers,
            json={
                "job_requirement_id": job.id,
                "status": "Application Opened",
                "application_method": "employer_website",
            },
        )
        assert reopen.status_code in (200, 201), reopen.text
        assert reopen.json()["status"] == status


def test_repeated_mark_contacted_no_duplicate_reminders(client, db_session, guest_headers):
    job = make_published_job(db_session, application_url=None)
    first = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={"job_requirement_id": job.id, "status": "Recruiter Contacted"},
    )
    assert first.status_code in (200, 201), first.text
    follow_up = first.json()["follow_up_date"]
    assert follow_up is not None
    second = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={"job_requirement_id": job.id, "status": "Recruiter Contacted"},
    )
    assert second.status_code in (200, 201)
    assert second.json()["follow_up_date"] == follow_up
    assert _count_apps(db_session, guest_id=guest_headers["X-Guest-Id"]) == 1


def test_repeated_mark_applied_no_duplicate_reminders(client, db_session, guest_headers):
    job = make_published_job(db_session)
    opened = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={
            "job_requirement_id": job.id,
            "status": "Application Opened",
            "application_method": "employer_website",
        },
    )
    app_id = opened.json()["id"]
    first = client.post(f"/api/jobs/{app_id}/mark-applied", headers=guest_headers)
    assert first.status_code == 200, first.text
    follow_up = first.json()["follow_up_date"]
    assert follow_up is not None
    second = client.post(f"/api/jobs/{app_id}/mark-applied", headers=guest_headers)
    assert second.status_code == 200
    assert second.json()["follow_up_date"] == follow_up
    assert second.json()["status"] == "Applied"


def test_closed_unpublished_jobs_leave_discover(client, db_session, guest_headers):
    live = make_published_job(db_session, job_title="Live Role")
    closed = make_published_job(db_session, job_title="Closed Role", status="Closed")
    unpublished = make_published_job(
        db_session, job_title="Draft Role", published_for_matching=False
    )
    draft_review = make_published_job(
        db_session, job_title="Unreviewed", review_status="Draft"
    )
    listing = client.get("/api/integrations/joblens/jobs", headers=guest_headers)
    assert listing.status_code == 200, listing.text
    data = listing.json()
    ids = {row["id"] for row in data["items"]}
    assert live.id in ids
    assert closed.id not in ids
    assert unpublished.id not in ids
    assert draft_review.id not in ids


def test_owner_keeps_historical_snapshot_after_close(client, db_session, guest_headers):
    job = make_published_job(db_session, job_title="Snapshot Role", job_description="Keep me")
    saved = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={"job_requirement_id": job.id, "status": "Saved"},
    )
    assert saved.status_code in (200, 201)
    assert saved.json()["job_snapshot_json"]
    job.status = "Closed"
    job.published_for_matching = False
    db_session.commit()

    public = client.get(f"/api/integrations/joblens/jobs/{job.id}", headers=guest_headers)
    assert public.status_code == 404

    owned = client.get(f"/api/jobs/{saved.json()['id']}", headers=guest_headers)
    assert owned.status_code == 200
    assert owned.json()["job_snapshot_json"]
    assert "Snapshot Role" in owned.json()["job_snapshot_json"]


def test_other_user_cannot_access_snapshot(client, db_session, guest_headers, other_guest_headers):
    job = make_published_job(db_session)
    saved = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={"job_requirement_id": job.id, "status": "Saved"},
    )
    app_id = saved.json()["id"]
    denied = client.get(f"/api/jobs/{app_id}", headers=other_guest_headers)
    assert denied.status_code == 404


def test_invalid_application_url_rejected(client, db_session, guest_headers):
    job = make_published_job(db_session, application_url="not-a-valid-url")
    r = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={
            "job_requirement_id": job.id,
            "status": "Application Opened",
            "application_method": "employer_website",
        },
    )
    assert r.status_code == 422
    assert "valid" in r.json()["detail"].lower() or "url" in r.json()["detail"].lower()


def test_jobs_without_application_url_use_recruiter_contact(client, db_session, guest_headers):
    job = make_published_job(
        db_session,
        application_url=None,
        recruiter_email="recruiter@example.com",
    )
    # Employer apply path rejected
    bad = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={
            "job_requirement_id": job.id,
            "status": "Application Opened",
            "application_method": "employer_website",
        },
    )
    assert bad.status_code == 422

    # Recruiter contact path works
    ok = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={"job_requirement_id": job.id, "status": "Recruiter Contacted"},
    )
    assert ok.status_code in (200, 201), ok.text
    body = ok.json()
    assert body["status"] == "Recruiter Contacted"
    assert body["recruiter_contacted_at"] is not None
    assert body["follow_up_date"] is not None


def test_reminder_failure_preserves_status_and_returns_warning(client, db_session, guest_headers):
    job = make_published_job(db_session, application_url=None)
    from routers import jobs as jobs_mod

    def fail_attach(db, job_id, *, days, reminder_type="follow_up_email"):
        return {
            "reminder_created": False,
            "warning_code": "REMINDER_CREATION_FAILED",
            "warning_message": jobs_mod.REMINDER_FAIL_MESSAGE,
        }

    with patch.object(jobs_mod, "_attach_reminder_safely", side_effect=fail_attach):
        r = client.post(
            "/api/jobs/from-external",
            headers=guest_headers,
            json={"job_requirement_id": job.id, "status": "Recruiter Contacted"},
        )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    assert body["status"] == "Recruiter Contacted"
    assert body["warning_code"] == "REMINDER_CREATION_FAILED"
    assert body["reminder_created"] is False
    assert "follow-up reminder could not be created" in body["warning_message"].lower()
    row = db_session.query(JobApplication).one()
    assert row.status == "Recruiter Contacted"
    assert row.recruiter_contacted_at is not None
