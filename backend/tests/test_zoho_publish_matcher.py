"""Publish gates for Zoho / ATS jobs → JobLens published list."""

from conftest import make_published_job


def test_zoho_job_without_url_appears_when_approved_open_published(client, db_session, guest_headers):
    job = make_published_job(
        db_session,
        job_title="Senior eGRC API Developer",
        source="Zoho Mail",
        application_platform="recruiter_email",
        application_url=None,
        status="Open",
        review_status="Approved",
        published_for_matching=True,
        work_type="Hybrid",
        recruiter_name="Alex Recruiter",
        recruiter_email="alex@vendor.example",
        job_description="Build eGRC APIs with strong auth and audit trails for enterprise clients.",
    )
    listing = client.get("/api/integrations/joblens/jobs/", headers=guest_headers)
    assert listing.status_code == 200
    ids = [j["id"] for j in listing.json()["items"]]
    assert job.id in ids
    row = next(j for j in listing.json()["items"] if j["id"] == job.id)
    assert row["source"] == "Email Imported"
    assert row.get("application_url") in (None, "")
    assert row["recruiter_name"] == "Alex Recruiter"

    detail = client.get(f"/api/integrations/joblens/jobs/{job.id}", headers=guest_headers)
    assert detail.status_code == 200
    body = detail.json()
    assert body["job_title"] == "Senior eGRC API Developer"
    assert body["recruiter_email"] == "alex@vendor.example"
    assert not body.get("application_url")


def test_draft_published_flag_does_not_list(client, db_session, guest_headers):
    """Root cause repro: publish toggle alone is not enough without Approved."""
    job = make_published_job(
        db_session,
        job_title="Draft Zoho Role",
        source="Zoho Mail",
        application_platform="recruiter_email",
        review_status="Draft",
        published_for_matching=True,
        status="Ready for Match",
    )
    listing = client.get("/api/integrations/joblens/jobs/", headers=guest_headers)
    ids = [j["id"] for j in listing.json()["items"]]
    assert job.id not in ids


def test_unapproved_closed_unpublished_excluded(client, db_session, guest_headers):
    live = make_published_job(db_session, job_title="Live")
    closed = make_published_job(db_session, job_title="Closed", status="Closed")
    unpublished = make_published_job(
        db_session, job_title="Unpublished", published_for_matching=False
    )
    draft = make_published_job(
        db_session, job_title="Draft", review_status="Draft"
    )
    listing = client.get("/api/integrations/joblens/jobs/", headers=guest_headers)
    ids = [j["id"] for j in listing.json()["items"]]
    assert live.id in ids
    assert closed.id not in ids
    assert unpublished.id not in ids
    assert draft.id not in ids


def test_hybrid_appears_with_all_filters(client, db_session, guest_headers):
    hybrid = make_published_job(
        db_session,
        job_title="Hybrid Role",
        work_type="Hybrid",
        source="Zoho Mail",
        application_platform="recruiter_email",
        application_url=None,
    )
    remote = make_published_job(db_session, job_title="Remote Role", work_type="Remote")
    all_jobs = client.get("/api/integrations/joblens/jobs/", headers=guest_headers)
    ids = [j["id"] for j in all_jobs.json()["items"]]
    assert hybrid.id in ids
    assert remote.id in ids

    filtered = client.get(
        "/api/integrations/joblens/jobs/?work_type=Hybrid", headers=guest_headers
    )
    fids = [j["id"] for j in filtered.json()["items"]]
    assert hybrid.id in fids
    assert remote.id not in fids


def test_source_email_filter(client, db_session, guest_headers):
    zoho = make_published_job(
        db_session,
        job_title="Zoho Role",
        source="Zoho Mail",
        application_platform="recruiter_email",
        application_url=None,
    )
    gh = make_published_job(
        db_session,
        job_title="GH Role",
        source="Greenhouse",
        application_platform="greenhouse",
    )
    res = client.get("/api/integrations/joblens/jobs/?source=email", headers=guest_headers)
    ids = [j["id"] for j in res.json()["items"]]
    assert zoho.id in ids
    assert gh.id not in ids


def test_publish_blockers_unit():
    from services.job_publish import publish_blockers, exclusion_reason

    assert "Approve this job before publishing." in publish_blockers(
        {"published_for_matching": True, "review_status": "Draft", "status": "Open",
         "job_description": "x" * 40, "recruiter_name": "A"}
    )
    assert "Only open jobs can be published." in publish_blockers(
        {"review_status": "Approved", "status": "Closed",
         "job_description": "x" * 40, "recruiter_name": "A"}
    )
    assert "A job description is required." in publish_blockers(
        {"review_status": "Approved", "status": "Open",
         "job_description": "short", "recruiter_name": "A"}
    )
    assert "Recruiter information is incomplete." in publish_blockers(
        {"review_status": "Approved", "status": "Open",
         "job_description": "x" * 40}
    )
    assert publish_blockers(
        {"review_status": "Approved", "status": "Open",
         "job_description": "x" * 40, "recruiter_email": "a@b.c"}
    ) == []

    class Obj:
        review_status = "Draft"
        status = "Open"
        published_for_matching = True
        job_description = "long enough description here"

    assert exclusion_reason(Obj()) == "not_approved"


def test_create_rejects_publish_without_approve(client, db_session):
    """ATS create with publish=true + Draft review should 422."""
    from unittest.mock import MagicMock
    # When ATS auth is off, job-requirements still need a session; use guest path if open.
    # Prefer updating an existing job via direct service check already covered;
    # exercise HTTP if the route is available without Clerk.
    payload = {
        "job_title": "Need Approve",
        "job_description": "A sufficiently long job description for publishing rules.",
        "recruiter_name": "Pat",
        "status": "Open",
        "review_status": "Draft",
        "published_for_matching": True,
        "source": "Zoho Mail",
    }
    res = client.post("/api/job-requirements/", json=payload)
    # 401/403 if ATS auth required; 422 if auth off and publish rules fire.
    assert res.status_code in (401, 403, 422)
    if res.status_code == 422:
        assert "Approve" in res.json()["detail"]


def test_debug_diagnostics_in_non_production(client, db_session, guest_headers, monkeypatch):
    monkeypatch.setenv("ENV", "development")
    make_published_job(
        db_session,
        job_title="Hidden Draft",
        review_status="Draft",
        published_for_matching=True,
    )
    res = client.get("/api/integrations/joblens/jobs/?debug=true", headers=guest_headers)
    assert res.status_code == 200
    data = res.json()
    assert "diagnostics" in data
    reasons = {e["reason"] for e in data["diagnostics"]["excluded_sample"]}
    assert "not_approved" in reasons


def test_cache_control_no_store(client, db_session, guest_headers):
    make_published_job(db_session)
    res = client.get("/api/integrations/joblens/jobs/", headers=guest_headers)
    assert "no-store" in res.headers.get("cache-control", "").lower()
