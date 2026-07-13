"""Phase 5 M3 — documents, one-time upload tokens, submission confirmation."""

from __future__ import annotations

import uuid
from pathlib import Path

from auth import create_access_token, COOKIE_NAME, hash_password
from models import (
    User,
    JobApplication,
    SeekerDocument,
    CoverLetter,
)
from services.seeker_document_storage import save_seeker_bytes, UPLOAD_DIR


def _ext_auth(client):
    ch = str(uuid.uuid4())
    assert client.post("/api/extension/auth/start", json={"challenge": ch, "extension_version": "0.3.0"}).status_code == 200
    assert client.post("/api/extension/auth/confirm", json={"challenge": ch}).status_code == 200
    ex = client.post("/api/extension/auth/exchange", json={"challenge": ch})
    assert ex.status_code == 200
    return {"Authorization": f"Bearer {ex.json()['access_token']}"}


def _seed_resume_doc(db_session, user_id: int, name="resume.pdf") -> SeekerDocument:
    content = b"%PDF-1.4 fake resume content for tests " + b"x" * 80
    path, mime, size, digest = save_seeker_bytes(str(user_id), name, content)
    doc = SeekerDocument(
        user_id=user_id,
        document_type="resume",
        file_name=name,
        mime_type=mime,
        file_size=size,
        version_number=1,
        storage_path=path,
        content_sha256=digest,
    )
    db_session.add(doc)
    db_session.commit()
    db_session.refresh(doc)
    return doc


def test_documents_list_ownership(client, db_session, auth_user, other_guest_headers):
    client.cookies.set(COOKIE_NAME, create_access_token(auth_user.id))
    doc = _seed_resume_doc(db_session, auth_user.id)
    ext = _ext_auth(client)
    listed = client.get("/api/extension/documents", headers=ext)
    assert listed.status_code == 200
    ids = [d["id"] for d in listed.json()["documents"]]
    assert doc.id in ids

    # Other guest cannot see
    client.cookies.clear()
    ch = str(uuid.uuid4())
    client.post("/api/extension/auth/start", json={"challenge": ch, "extension_version": "0.3.0"})
    client.post("/api/extension/auth/confirm", json={"challenge": ch}, headers=other_guest_headers)
    tok = client.post("/api/extension/auth/exchange", json={"challenge": ch}).json()["access_token"]
    other = client.get("/api/extension/documents", headers={"Authorization": f"Bearer {tok}"})
    assert other.status_code == 200
    assert doc.id not in [d["id"] for d in other.json()["documents"]]


def test_upload_token_one_time_and_expired_style(client, db_session, auth_user):
    client.cookies.set(COOKIE_NAME, create_access_token(auth_user.id))
    doc = _seed_resume_doc(db_session, auth_user.id)
    ext = _ext_auth(client)

    start = client.post(
        "/api/extension/upload-session/start",
        headers=ext,
        json={
            "document_type": "resume",
            "source_document_id": doc.id,
            "employer_field": {"external_field_key": "resume", "field_label": "Resume", "accept": ".pdf,application/pdf"},
        },
    )
    assert start.status_code == 200, start.text
    sid = start.json()["upload_session_id"]
    token = start.json()["retrieval_token"]

    first = client.get(
        f"/api/extension/upload-session/{sid}/file",
        headers=ext,
        params={"retrieval_token": token},
    )
    assert first.status_code == 200
    assert first.content.startswith(b"%PDF")

    second = client.get(
        f"/api/extension/upload-session/{sid}/file",
        headers=ext,
        params={"retrieval_token": token},
    )
    assert second.status_code == 410


def test_wrong_user_cannot_retrieve(client, db_session, auth_user, other_guest_headers):
    client.cookies.set(COOKIE_NAME, create_access_token(auth_user.id))
    doc = _seed_resume_doc(db_session, auth_user.id)
    ext = _ext_auth(client)
    start = client.post(
        "/api/extension/upload-session/start",
        headers=ext,
        json={
            "document_type": "resume",
            "source_document_id": doc.id,
            "employer_field": {"external_field_key": "resume", "field_label": "Resume"},
        },
    )
    sid = start.json()["upload_session_id"]
    token = start.json()["retrieval_token"]

    client.cookies.clear()
    ch = str(uuid.uuid4())
    client.post("/api/extension/auth/start", json={"challenge": ch, "extension_version": "0.3.0"})
    client.post("/api/extension/auth/confirm", json={"challenge": ch}, headers=other_guest_headers)
    tok = client.post("/api/extension/auth/exchange", json={"challenge": ch}).json()["access_token"]
    bad = client.get(
        f"/api/extension/upload-session/{sid}/file",
        headers={"Authorization": f"Bearer {tok}"},
        params={"retrieval_token": token},
    )
    assert bad.status_code == 404


def test_unsupported_accept_rejected(client, db_session, auth_user):
    client.cookies.set(COOKIE_NAME, create_access_token(auth_user.id))
    doc = _seed_resume_doc(db_session, auth_user.id, name="resume.pdf")
    ext = _ext_auth(client)
    r = client.post(
        "/api/extension/upload-session/start",
        headers=ext,
        json={
            "document_type": "resume",
            "source_document_id": doc.id,
            "employer_field": {"external_field_key": "resume", "accept": ".docx"},
        },
    )
    assert r.status_code == 422


def test_submission_confirm_sets_applied_once(client, db_session, auth_user):
    client.cookies.set(COOKIE_NAME, create_access_token(auth_user.id))
    doc = _seed_resume_doc(db_session, auth_user.id)
    job = JobApplication(
        company="Acme", role="Eng", status="Application In Progress",
        user_id=auth_user.id, job_url="https://boards.greenhouse.io/acme/jobs/1",
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    ext = _ext_auth(client)

    # Filling/uploading must not set Applied — confirm without checkbox fails
    bad = client.post(
        "/api/extension/submission/confirm",
        headers=ext,
        json={"job_application_id": job.id, "confirmed": False},
    )
    assert bad.status_code == 422

    ok = client.post(
        "/api/extension/submission/confirm",
        headers=ext,
        json={
            "job_application_id": job.id,
            "confirmed": True,
            "resume_document_id": doc.id,
            "confirmation_number": "GH-123",
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["applied"] is True
    db_session.refresh(job)
    assert job.status == "Applied"
    assert job.applied_at is not None
    assert job.follow_up_date is not None
    assert job.resume_document_id == doc.id
    assert job.confirmation_number == "GH-123"
    first_follow = job.follow_up_date

    # Repeat confirmation — no duplicate reminder date change / still Applied
    again = client.post(
        "/api/extension/submission/confirm",
        headers=ext,
        json={"job_application_id": job.id, "confirmed": True},
    )
    assert again.status_code == 200
    db_session.refresh(job)
    assert job.follow_up_date == first_follow


def test_save_in_progress_no_applied(client, db_session, auth_user):
    client.cookies.set(COOKIE_NAME, create_access_token(auth_user.id))
    job = JobApplication(
        company="Acme", role="Eng", status="Application Opened",
        user_id=auth_user.id,
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    ext = _ext_auth(client)
    r = client.post(
        "/api/extension/submission/confirm",
        headers=ext,
        json={"job_application_id": job.id, "confirmed": False, "save_as_in_progress": True},
    )
    assert r.status_code == 200
    db_session.refresh(job)
    assert job.status == "Application In Progress"
    assert job.applied_at is None


def test_protected_status_not_overwritten(client, db_session, auth_user):
    client.cookies.set(COOKIE_NAME, create_access_token(auth_user.id))
    job = JobApplication(
        company="Acme", role="Eng", status="Interviewing",
        user_id=auth_user.id,
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    ext = _ext_auth(client)
    r = client.post(
        "/api/extension/submission/confirm",
        headers=ext,
        json={"job_application_id": job.id, "confirmed": True},
    )
    assert r.status_code == 200
    assert r.json().get("warning")
    db_session.refresh(job)
    assert job.status == "Interviewing"


def test_no_submit_application_in_message_contract():
    from pathlib import Path
    text = Path(__file__).resolve().parents[2].joinpath(
        "browser-extension/src/types/messages.ts"
    ).read_text(encoding="utf-8")
    assert "SUBMIT_APPLICATION" not in text
