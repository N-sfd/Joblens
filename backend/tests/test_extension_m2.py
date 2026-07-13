"""Phase 5 M2 — fill session mapping, ownership, no-value storage, status guard."""

from __future__ import annotations

import uuid

from models import Profile, JobApplication, User
from auth import hash_password
from services.extension_fill import map_detected_fields, build_profile_value_map, FILLABLE_FIELDS


def _auth(client, headers):
    ch = str(uuid.uuid4())
    assert client.post("/api/extension/auth/start", json={"challenge": ch, "extension_version": "0.3.0"}).status_code == 200
    assert client.post("/api/extension/auth/confirm", json={"challenge": ch}, headers=headers).status_code == 200
    ex = client.post("/api/extension/auth/exchange", json={"challenge": ch})
    assert ex.status_code == 200
    return {"Authorization": f"Bearer {ex.json()['access_token']}"}


def test_fill_session_map_minimizes_and_excludes_sensitive(client, db_session, auth_user):
    # Cookie auth user for confirm
    from auth import create_access_token, COOKIE_NAME
    token = create_access_token(auth_user.id)
    client.cookies.set(COOKIE_NAME, token)

    profile = Profile(
        user_id=auth_user.id,
        full_name="Pat Seeker",
        phone="555-0100",
        city="Austin",
        state="TX",
        country="US",
        postal_code="78701",
        linkedin_url="https://linkedin.com/in/pat",
        experience='[{"company":"Acme","title":"Engineer"}]',
        work_authorization_json='{"current_authorization":"Authorized","sponsorship_required_now":false,"user_confirmed":true}',
    )
    db_session.add(profile)
    db_session.commit()

    ext = _auth(client, {})  # uses cookie from client
    # Confirm used cookie; guest header not needed when cookie present — exchange already done via cookie owner

    detected = [
        {"external_field_key": "first_name", "field_label": "First Name", "field_type": "text",
         "normalized_field_name": "first_name", "classification": "supported", "confidence": 0.9,
         "is_required": True, "is_upload": False, "options": []},
        {"external_field_key": "resume", "field_label": "Resume", "field_type": "file",
         "normalized_field_name": "resume_upload", "classification": "supported", "confidence": 0.9,
         "is_required": True, "is_upload": True, "options": []},
        {"external_field_key": "gender", "field_label": "Gender", "field_type": "select",
         "normalized_field_name": None, "classification": "sensitive_question", "confidence": 0.9,
         "is_required": False, "is_upload": False, "options": ["A", "B"]},
        {"external_field_key": "certify", "field_label": "I certify", "field_type": "checkbox",
         "normalized_field_name": None, "classification": "legal_attestation", "confidence": 0.9,
         "is_required": True, "is_upload": False, "options": []},
        {"external_field_key": "sponsor", "field_label": "Need sponsorship?", "field_type": "select",
         "normalized_field_name": "sponsorship_required", "classification": "supported", "confidence": 0.9,
         "is_required": True, "is_upload": False, "options": ["Yes", "No"]},
    ]

    start = client.post(
        "/api/extension/fill-session/start",
        headers=ext,
        json={
            "application_url": "https://boards.greenhouse.io/acme/jobs/1",
            "platform": "greenhouse",
            "detected_fields": detected,
            "detector_version": "1.0.0-m2",
            "extension_version": "0.2.0",
        },
    )
    assert start.status_code == 200, start.text
    sid = start.json()["fill_session_id"]
    assert start.json()["capabilities"]["submit_application"] is False
    assert start.json()["capabilities"]["upload_resume"] is True

    mapped = client.post(
        "/api/extension/fill-session/map",
        headers=ext,
        json={"fill_session_id": sid, "detected_fields": detected},
    )
    assert mapped.status_code == 200, mapped.text
    rows = mapped.json()["mappings"]
    by_key = {r["external_field_key"]: r for r in rows}

    assert by_key["first_name"]["mapping_status"] == "Ready"
    assert by_key["first_name"]["approved_value"] == "Pat"
    assert by_key["resume"]["mapping_status"] == "Manual Upload Required"
    assert by_key["resume"]["approved_value"] is None
    assert by_key["gender"]["mapping_status"] == "Sensitive — Manual Entry"
    assert by_key["certify"]["mapping_status"] == "Sensitive — Manual Entry"
    assert by_key["sponsor"]["requires_individual_confirmation"] is True
    assert by_key["sponsor"]["approved_value"] == "No"

    # Session row must not store approved values
    from models import ExtensionFillSession
    sess = db_session.query(ExtensionFillSession).filter(ExtensionFillSession.id == sid).first()
    assert "Pat" not in (sess.approved_fields_json or "")
    assert "first_name" in (sess.approved_fields_json or "")


def test_fill_result_no_status_downgrade(client, db_session, auth_user, guest_headers):
    from auth import create_access_token, COOKIE_NAME
    client.cookies.set(COOKIE_NAME, create_access_token(auth_user.id))

    job = JobApplication(
        company="Acme",
        role="Eng",
        status="Interviewing",
        user_id=auth_user.id,
        job_url="https://boards.greenhouse.io/acme/jobs/1",
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    ext = _auth(client, {})
    start = client.post(
        "/api/extension/fill-session/start",
        headers=ext,
        json={
            "job_id": job.id,
            "application_url": "https://boards.greenhouse.io/acme/jobs/1",
            "platform": "greenhouse",
            "detected_fields": [],
            "extension_version": "0.2.0",
        },
    )
    sid = start.json()["fill_session_id"]
    res = client.post(
        "/api/extension/fill-session/result",
        headers=ext,
        json={
            "fill_session_id": sid,
            "successful_fields": ["first_name", "email"],
            "skipped_fields": [],
            "failed_fields": [],
            "unsupported_fields": ["gender"],
            "missing_fields": [],
            "user_reviewed_sensitive_fields": [],
        },
    )
    assert res.status_code == 200, res.text
    db_session.refresh(job)
    assert job.status == "Interviewing"


def test_fill_result_sets_in_progress(client, db_session, auth_user):
    from auth import create_access_token, COOKIE_NAME
    client.cookies.set(COOKIE_NAME, create_access_token(auth_user.id))
    job = JobApplication(
        company="Acme", role="Eng", status="Application Opened",
        user_id=auth_user.id, job_url="https://boards.greenhouse.io/acme/jobs/2",
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    ext = _auth(client, {})
    sid = client.post(
        "/api/extension/fill-session/start",
        headers=ext,
        json={"job_id": job.id, "platform": "greenhouse", "application_url": job.job_url, "detected_fields": []},
    ).json()["fill_session_id"]
    client.post(
        "/api/extension/fill-session/result",
        headers=ext,
        json={
            "fill_session_id": sid,
            "successful_fields": ["email"],
            "skipped_fields": [],
            "failed_fields": [],
            "unsupported_fields": [],
            "missing_fields": ["phone"],
            "user_reviewed_sensitive_fields": [],
        },
    )
    db_session.refresh(job)
    assert job.status == "Application In Progress"
    assert job.action_required is True


def test_fill_session_ownership(client, db_session, auth_user, other_guest_headers):
    from auth import create_access_token, COOKIE_NAME
    client.cookies.set(COOKIE_NAME, create_access_token(auth_user.id))
    ext = _auth(client, {})
    sid = client.post(
        "/api/extension/fill-session/start",
        headers=ext,
        json={"platform": "greenhouse", "application_url": "https://boards.greenhouse.io/a/jobs/1", "detected_fields": []},
    ).json()["fill_session_id"]

    # Other guest gets own token
    client.cookies.clear()
    ch = str(uuid.uuid4())
    client.post("/api/extension/auth/start", json={"challenge": ch, "extension_version": "0.3.0"})
    client.post("/api/extension/auth/confirm", json={"challenge": ch}, headers=other_guest_headers)
    tok = client.post("/api/extension/auth/exchange", json={"challenge": ch}).json()["access_token"]
    other = client.post(
        "/api/extension/fill-session/map",
        headers={"Authorization": f"Bearer {tok}"},
        json={"fill_session_id": sid, "detected_fields": []},
    )
    assert other.status_code == 404


def test_map_detected_fields_unit():
    values = {"first_name": "A", "email": "a@b.com", "sponsorship_required": "No",
              "_sponsorship_confirmed": True}
    rows = map_detected_fields(
        [
            {"external_field_key": "fn", "field_label": "First Name", "normalized_field_name": "first_name",
             "classification": "supported", "field_type": "text", "confidence": 1},
            {"external_field_key": "why", "field_label": "Why us?", "normalized_field_name": None,
             "classification": "custom_question", "field_type": "textarea", "confidence": 1},
        ],
        values,
    )
    assert rows[0]["approved_value"] == "A"
    assert rows[1]["mapping_status"] == "Unsupported"
    assert "resume_upload" not in FILLABLE_FIELDS
