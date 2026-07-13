"""Phase 4 Application Status API tests."""

from datetime import datetime, timedelta

from models import JobApplication, ApplicationNote
from conftest import make_published_job


def _create_app(db, guest_id, **kwargs):
    defaults = {
        "company": "Acme",
        "role": "Engineer",
        "status": "Saved",
        "guest_id": guest_id,
        "last_activity_at": datetime.utcnow(),
    }
    defaults.update(kwargs)
    row = JobApplication(**defaults)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_user_sees_only_own_applications(client, db_session, guest_headers, other_guest_headers):
    _create_app(db_session, guest_headers["X-Guest-Id"], role="Mine")
    _create_app(db_session, other_guest_headers["X-Guest-Id"], role="Theirs", company="OtherCo")
    r = client.get("/api/applications/status", headers=guest_headers)
    assert r.status_code == 200, r.text
    roles = [i["role"] for i in r.json()["items"]]
    assert roles == ["Mine"]


def test_summary_counts_correct(client, db_session, guest_headers):
    gid = guest_headers["X-Guest-Id"]
    _create_app(db_session, gid, status="Saved")
    _create_app(db_session, gid, status="Applied", company="B", role="R2")
    _create_app(db_session, gid, status="Interviewing", company="C", role="R3")
    r = client.get("/api/applications/status", headers=guest_headers)
    s = r.json()["summary"]
    assert s["total"] == 3
    assert s["by_status"]["Saved"] == 1
    assert s["applied"] == 1
    assert s["interviews"] == 1


def test_search_and_status_filters(client, db_session, guest_headers):
    gid = guest_headers["X-Guest-Id"]
    _create_app(db_session, gid, role="Backend Engineer", company="Acme", status="Applied")
    _create_app(db_session, gid, role="Frontend Dev", company="Beta", status="Saved")
    r = client.get("/api/applications/status?q=Backend&status=Applied", headers=guest_headers)
    assert r.status_code == 200
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["role"] == "Backend Engineer"


def test_sort_by_last_activity(client, db_session, guest_headers):
    gid = guest_headers["X-Guest-Id"]
    older = datetime.utcnow() - timedelta(days=5)
    newer = datetime.utcnow() - timedelta(hours=1)
    _create_app(db_session, gid, role="Old", last_activity_at=older)
    _create_app(db_session, gid, role="New", company="X", last_activity_at=newer)
    r = client.get(
        "/api/applications/status?sort=last_activity&order=desc",
        headers=guest_headers,
    )
    roles = [i["role"] for i in r.json()["items"]]
    assert roles[0] == "New"
    assert roles[1] == "Old"


def test_historical_snapshot_for_closed_job(client, db_session, guest_headers):
    job = make_published_job(db_session, job_title="Snap Role")
    saved = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={"job_requirement_id": job.id, "status": "Saved"},
    )
    app_id = saved.json()["id"]
    job.status = "Closed"
    job.published_for_matching = False
    db_session.commit()

    detail = client.get(f"/api/applications/{app_id}", headers=guest_headers)
    assert detail.status_code == 200
    body = detail.json()
    assert body["job_snapshot"] is not None
    assert body["source_job_closed"] is True
    assert "Snap Role" in (body["job_snapshot"].get("job_title") or "")


def test_invalid_status_transition_409(client, db_session, guest_headers):
    app = _create_app(db_session, guest_headers["X-Guest-Id"], status="Rejected")
    r = client.patch(
        f"/api/applications/{app.id}/status",
        headers=guest_headers,
        json={"status": "Applied", "confirmed": True},
    )
    assert r.status_code == 409
    # unchanged
    db_session.refresh(app)
    assert app.status == "Rejected"


def test_protected_status_cannot_downgrade_via_transition(client, db_session, guest_headers):
    app = _create_app(db_session, guest_headers["X-Guest-Id"], status="Offer")
    r = client.patch(
        f"/api/applications/{app.id}/status",
        headers=guest_headers,
        json={"status": "Saved", "confirmed": True},
    )
    assert r.status_code == 409
    db_session.refresh(app)
    assert app.status == "Offer"


def test_status_change_creates_activity(client, db_session, guest_headers):
    app = _create_app(db_session, guest_headers["X-Guest-Id"], status="Saved")
    r = client.patch(
        f"/api/applications/{app.id}/status",
        headers=guest_headers,
        json={"status": "Applied", "confirmed": False},
    )
    assert r.status_code == 200, r.text
    assert r.json()["application"]["status"] == "Applied"
    activity = client.get("/api/activity/", headers=guest_headers)
    assert activity.status_code == 200
    types = [a["activity_type"] for a in activity.json()]
    assert "status_changed" in types


def test_notes_enforce_ownership(client, db_session, guest_headers, other_guest_headers):
    app = _create_app(db_session, guest_headers["X-Guest-Id"])
    created = client.post(
        f"/api/applications/{app.id}/notes",
        headers=guest_headers,
        json={"content": "Private note"},
    )
    assert created.status_code == 201
    note_id = created.json()["id"]

    denied = client.get(f"/api/applications/{app.id}", headers=other_guest_headers)
    assert denied.status_code == 404

    denied_edit = client.put(
        f"/api/applications/{app.id}/notes/{note_id}",
        headers=other_guest_headers,
        json={"content": "Hacked"},
    )
    assert denied_edit.status_code == 404


def test_reminder_data_returned(client, db_session, guest_headers):
    due = datetime.utcnow() + timedelta(days=2)
    app = _create_app(
        db_session,
        guest_headers["X-Guest-Id"],
        follow_up_date=due,
        reminder_type="follow_up_email",
    )
    detail = client.get(f"/api/applications/{app.id}", headers=guest_headers)
    assert detail.status_code == 200
    assert detail.json()["reminder_status"] == "upcoming"
    assert detail.json()["application"]["follow_up_date"] is not None


def test_closed_job_visible_to_tracker_owner(client, db_session, guest_headers):
    job = make_published_job(db_session)
    saved = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={"job_requirement_id": job.id, "status": "Saved"},
    )
    app_id = saved.json()["id"]
    job.status = "Closed"
    db_session.commit()
    listing = client.get("/api/applications/status", headers=guest_headers)
    ids = [i["id"] for i in listing.json()["items"]]
    assert app_id in ids


def test_closed_job_inaccessible_to_unrelated(client, db_session, guest_headers, other_guest_headers):
    job = make_published_job(db_session)
    saved = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={"job_requirement_id": job.id, "status": "Saved"},
    )
    app_id = saved.json()["id"]
    job.status = "Closed"
    db_session.commit()
    r = client.get(f"/api/applications/{app_id}", headers=other_guest_headers)
    assert r.status_code == 404


def test_pagination(client, db_session, guest_headers):
    gid = guest_headers["X-Guest-Id"]
    for i in range(5):
        _create_app(db_session, gid, company=f"Co{i}", role=f"Role{i}")
    r = client.get("/api/applications/status?page=1&page_size=2", headers=guest_headers)
    body = r.json()
    assert body["page_size"] == 2
    assert len(body["items"]) == 2
    assert body["total"] == 5
    assert body["total_pages"] == 3


def test_empty_state(client, guest_headers):
    r = client.get("/api/applications/status", headers=guest_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["summary"]["total"] == 0


def test_application_method_labels(client, db_session, guest_headers):
    app = _create_app(
        db_session,
        guest_headers["X-Guest-Id"],
        application_method="employer_website",
    )
    r = client.get("/api/applications/status", headers=guest_headers)
    item = next(i for i in r.json()["items"] if i["id"] == app.id)
    assert item["application_method_label"] == "Employer Website"
