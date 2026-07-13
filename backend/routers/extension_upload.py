"""Phase 5 M3 — document list, upload sessions, submission confirmation."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta
from typing import Any, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import Response as FastAPIResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import Owner, owned, log_activity
from database import get_db
from models import (
    SeekerDocument,
    ApplicationDocument,
    ExtensionUploadSession,
    ExtensionFillSession,
    JobApplication,
    CoverLetter,
    Profile,
)
from services import extension_auth as ext_auth
from services import extension_flags as flags
from services import extension_audit as ext_audit
from services.extension_config import load_extension_config
from services.rate_limit import (
    rate_limit_ext_upload,
    rate_limit_ext_document_retrieve,
    rate_limit_ext_submission,
)
from services.seeker_document_storage import (
    read_seeker_path,
    save_seeker_bytes,
    guess_mime,
    ALLOWED_EXTENSIONS,
    MAX_BYTES,
)
from routers.jobs import _attach_reminder_safely, AUTO_GUARD_STATUSES

router = APIRouter()

UPLOAD_TOKEN_MINUTES = 5
PROTECTED_ADVANCED = {"Interviewing", "Offer", "Rejected", "Withdrawn"}


def _upload_ttl_minutes() -> int:
    return max(1, load_extension_config().document_token_ttl_seconds // 60)


def _utcnow() -> datetime:
    return datetime.utcnow()


def _owned_doc(db: Session, owner: Owner, doc_id: int) -> SeekerDocument:
    doc = (
        owned(db.query(SeekerDocument), SeekerDocument, owner)
        .filter(SeekerDocument.id == doc_id, SeekerDocument.deleted_at.is_(None))
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return doc


def _accept_allows(accept: Optional[str], filename: str, mime: str) -> bool:
    if not accept or not str(accept).strip():
        return True
    parts = [p.strip().lower() for p in accept.split(",") if p.strip()]
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    for p in parts:
        if p.startswith(".") and ext == p:
            return True
        if p == mime.lower():
            return True
        if p.endswith("/*") and mime.lower().startswith(p.split("/")[0] + "/"):
            return True
        if p in ("pdf", "application/pdf") and ext == ".pdf":
            return True
    # Greenhouse often uses empty accept — if nothing matched restrictive list
    return any(ext == e for e in ALLOWED_EXTENSIONS) and not parts


class EmployerFieldDef(BaseModel):
    external_field_key: str = ""
    field_label: str = ""
    accept: Optional[str] = None
    max_size_bytes: Optional[int] = None


class UploadSessionStart(BaseModel):
    fill_session_id: Optional[int] = None
    job_id: Optional[int] = None
    job_application_id: Optional[int] = None
    document_type: str  # resume | cover_letter
    source_document_id: int
    employer_field: EmployerFieldDef = Field(default_factory=EmployerFieldDef)


class UploadSessionResult(BaseModel):
    upload_session_id: int
    upload_status: str
    employer_field_label: Optional[str] = None
    verification_status: Optional[str] = None
    error_code: Optional[str] = None
    completed_at: Optional[datetime] = None


class SubmissionConfirm(BaseModel):
    job_application_id: int
    fill_session_id: Optional[int] = None
    confirmed: bool = False
    confirmation_number: Optional[str] = None
    confirmation_url: Optional[str] = None
    submission_notes: Optional[str] = None
    resume_document_id: Optional[int] = None
    cover_letter_document_id: Optional[int] = None
    save_as_in_progress: bool = False


class SnapshotCoverLetterRequest(BaseModel):
    cover_letter_id: int


@router.get("/documents")
def list_documents(
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    """Sanitized metadata only — no file bytes."""
    caps = flags.effective_capabilities(owner)
    flags.require_capability(caps, "upload_resume", "Document upload is not enabled for this account.")
    docs = (
        owned(db.query(SeekerDocument), SeekerDocument, owner)
        .filter(SeekerDocument.deleted_at.is_(None))
        .order_by(SeekerDocument.created_at.desc())
        .limit(50)
        .all()
    )
    default_resume_id = None
    default_cl_id = None
    if owner.user_id:
        profile = db.query(Profile).filter(Profile.user_id == owner.user_id).first()
        if profile:
            default_resume_id = profile.default_resume_id
            default_cl_id = profile.default_cover_letter_id

    suggested_resume_id = None
    for d in docs:
        if d.document_type == "resume":
            if default_resume_id and d.source_resume_analysis_id == default_resume_id:
                suggested_resume_id = d.id
                break
    if suggested_resume_id is None:
        for d in docs:
            if d.document_type == "resume":
                suggested_resume_id = d.id
                break

    cover_letters = []
    if owner.user_id is not None or owner.guest_id:
        cls = owned(db.query(CoverLetter), CoverLetter, owner).order_by(CoverLetter.created_at.desc()).limit(20).all()
        for c in cls:
            cover_letters.append({
                "cover_letter_id": c.id,
                "company_name": c.company_name,
                "tone": c.tone,
                "updated_at": c.created_at.isoformat() + "Z" if c.created_at else None,
                "suggested": default_cl_id == c.id,
                "needs_snapshot": True,
                "upload_eligible": True,
                "file_type": "txt",
            })

    return {
        "documents": [
            {
                "id": d.id,
                "document_type": d.document_type,
                "file_name": d.file_name,
                "mime_type": d.mime_type,
                "file_size": d.file_size,
                "version_number": d.version_number,
                "updated_at": (d.updated_at or d.created_at).isoformat() + "Z" if (d.updated_at or d.created_at) else None,
                "source_resume_analysis_id": d.source_resume_analysis_id,
                "source_cover_letter_id": d.source_cover_letter_id,
                "suggested": d.id == suggested_resume_id,
                "upload_eligible": True,
            }
            for d in docs
        ],
        "cover_letters": cover_letters,
        "suggested_resume_id": suggested_resume_id,
        "max_bytes": MAX_BYTES,
        "allowed_extensions": sorted(ALLOWED_EXTENSIONS.keys()),
    }


@router.post("/documents/snapshot-cover-letter", status_code=201)
def snapshot_cover_letter(
    body: SnapshotCoverLetterRequest,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    """Create an immutable text/plain seeker document from a saved cover letter."""
    cl = (
        owned(db.query(CoverLetter), CoverLetter, owner)
        .filter(CoverLetter.id == body.cover_letter_id)
        .first()
    )
    if not cl:
        raise HTTPException(status_code=404, detail="Cover letter not found.")
    text = (cl.content or "").strip()
    if len(text) < 20:
        raise HTTPException(status_code=422, detail="Cover letter is empty.")
    filename = f"cover_letter_{cl.id}.txt"
    content = text.encode("utf-8")
    owner_key = str(owner.user_id or owner.guest_id or "anon")
    path, mime, size, digest = save_seeker_bytes(owner_key, filename, content)
    prev = (
        owned(db.query(SeekerDocument), SeekerDocument, owner)
        .filter(SeekerDocument.document_type == "cover_letter", SeekerDocument.deleted_at.is_(None))
        .count()
    )
    doc = SeekerDocument(
        user_id=owner.user_id,
        guest_id=owner.guest_id,
        document_type="cover_letter",
        file_name=filename,
        mime_type=mime,
        file_size=size,
        version_number=prev + 1,
        storage_path=path,
        source_cover_letter_id=cl.id,
        content_sha256=digest,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {
        "id": doc.id,
        "document_type": doc.document_type,
        "file_name": doc.file_name,
        "mime_type": doc.mime_type,
        "file_size": doc.file_size,
        "version_number": doc.version_number,
    }


@router.post("/upload-session/start")
def upload_session_start(
    body: UploadSessionStart,
    request: Request,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    rate_limit_ext_upload(request, user_id=ext_audit.owner_audit_id(owner))
    caps = flags.effective_capabilities(owner)
    flags.require_capability(caps, "upload_resume", "Document upload is not enabled for this account.")
    if body.document_type not in ("resume", "cover_letter"):
        raise HTTPException(status_code=422, detail="Invalid document_type.")
    doc = _owned_doc(db, owner, body.source_document_id)
    if doc.document_type != body.document_type:
        raise HTTPException(status_code=422, detail="Document type mismatch.")
    if body.fill_session_id:
        fs = (
            owned(db.query(ExtensionFillSession), ExtensionFillSession, owner)
            .filter(ExtensionFillSession.id == body.fill_session_id)
            .first()
        )
        if not fs:
            raise HTTPException(status_code=404, detail="Fill session not found.")
        if fs.expires_at < _utcnow():
            raise HTTPException(status_code=410, detail="Fill session expired.")

    accept = body.employer_field.accept
    if not _accept_allows(accept, doc.file_name, doc.mime_type):
        raise HTTPException(
            status_code=422,
            detail="This employer does not accept the selected file format.",
        )
    max_size = body.employer_field.max_size_bytes or MAX_BYTES
    if doc.file_size > max_size:
        raise HTTPException(status_code=422, detail="Selected file exceeds the employer size limit.")

    token = secrets.token_urlsafe(32)
    ttl = _upload_ttl_minutes()
    row = ExtensionUploadSession(
        user_id=owner.user_id,
        guest_id=owner.guest_id,
        fill_session_id=body.fill_session_id,
        job_application_id=body.job_application_id or body.job_id,
        seeker_document_id=doc.id,
        document_type=body.document_type,
        employer_field_key=body.employer_field.external_field_key,
        employer_field_label=body.employer_field.field_label,
        accept_attr=accept,
        retrieval_token_hash=ext_auth.hash_secret(token),
        status="approved",
        expires_at=_utcnow() + timedelta(minutes=ttl),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    log_activity(
        db, owner, "upload_approved",
        f"{body.document_type} upload approved",
        f"doc={doc.id}; field={body.employer_field.field_label or ''}",
    )
    ext_audit.log_extension_event(
        db,
        "extension.document_token_issued",
        user_id=ext_audit.owner_audit_id(owner),
        session_id=str(row.id),
        outcome="ok",
        extra_summary=f"doc_type={body.document_type}; version={doc.version_number}",
    )

    return {
        "upload_session_id": row.id,
        "document": {
            "id": doc.id,
            "document_type": doc.document_type,
            "file_name": doc.file_name,
            "mime_type": doc.mime_type,
            "file_size": doc.file_size,
            "version_number": doc.version_number,
        },
        "eligible": True,
        "retrieval_token": token,
        "expires_at": row.expires_at.isoformat() + "Z",
        "employer_field_label": row.employer_field_label,
    }


@router.get("/upload-session/{upload_session_id}/file")
def upload_session_retrieve(
    upload_session_id: int,
    retrieval_token: str,
    request: Request,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    rate_limit_ext_document_retrieve(request, user_id=ext_audit.owner_audit_id(owner))
    caps = flags.effective_capabilities(owner)
    flags.require_capability(caps, "upload_resume")
    row = (
        owned(db.query(ExtensionUploadSession), ExtensionUploadSession, owner)
        .filter(ExtensionUploadSession.id == upload_session_id)
        .first()
    )
    if not row:
        ext_audit.log_extension_event(
            db,
            "extension.document_access_denied",
            user_id=ext_audit.owner_audit_id(owner),
            outcome="denied",
            error_code="not_found",
        )
        raise HTTPException(status_code=404, detail="Upload session not found.")
    if row.expires_at < _utcnow():
        row.status = "expired"
        db.commit()
        raise HTTPException(status_code=410, detail="Upload retrieval expired.")
    if row.status in ("used", "cancelled", "expired"):
        ext_audit.log_extension_event(
            db,
            "extension.document_access_denied",
            user_id=ext_audit.owner_audit_id(owner),
            session_id=str(row.id),
            outcome="denied",
            error_code="token_reused",
        )
        raise HTTPException(status_code=410, detail="Upload token already used or revoked.")
    if row.retrieval_token_hash != ext_auth.hash_secret(retrieval_token):
        ext_audit.log_extension_event(
            db,
            "extension.document_access_denied",
            user_id=ext_audit.owner_audit_id(owner),
            session_id=str(row.id),
            outcome="denied",
            error_code="invalid_token",
        )
        raise HTTPException(status_code=401, detail="Invalid retrieval token.")

    doc = _owned_doc(db, owner, row.seeker_document_id)
    try:
        data = read_seeker_path(doc.storage_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Resume file missing.") from None

    row.status = "used"
    row.used_at = _utcnow()
    db.commit()
    ext_audit.log_extension_event(
        db,
        "extension.document_uploaded",
        user_id=ext_audit.owner_audit_id(owner),
        session_id=str(row.id),
        outcome="ok",
        extra_summary=f"bytes_served={len(data)}; version={doc.version_number}",
    )

    headers = {
        "Content-Disposition": f'attachment; filename="{doc.file_name}"',
        "X-JobLens-Document-Id": str(doc.id),
        "X-JobLens-Document-Version": str(doc.version_number),
    }
    return FastAPIResponse(content=data, media_type=doc.mime_type, headers=headers)


@router.post("/upload-session/result")
def upload_session_result(
    body: UploadSessionResult,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    row = (
        owned(db.query(ExtensionUploadSession), ExtensionUploadSession, owner)
        .filter(ExtensionUploadSession.id == body.upload_session_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Upload session not found.")

    row.verification_status = body.verification_status
    row.error_code = body.error_code
    if body.upload_status in ("uploaded", "verified", "manual_required", "failed", "replaced", "cancelled"):
        row.status = body.upload_status
    row.updated_at = _utcnow()

    doc = _owned_doc(db, owner, row.seeker_document_id)
    app_id = row.job_application_id
    if app_id and body.upload_status in ("uploaded", "verified", "manual_required", "replaced"):
        existing = (
            db.query(ApplicationDocument)
            .filter(
                ApplicationDocument.job_application_id == app_id,
                ApplicationDocument.document_type == row.document_type,
                ApplicationDocument.source_document_id == doc.id,
            )
            .first()
        )
        if not existing:
            ad = ApplicationDocument(
                user_id=owner.user_id,
                guest_id=owner.guest_id,
                job_application_id=app_id,
                extension_fill_session_id=row.fill_session_id,
                document_type=row.document_type,
                source_document_id=doc.id,
                source_document_version=doc.version_number,
                file_name=doc.file_name,
                mime_type=doc.mime_type,
                file_size=doc.file_size,
                upload_method="extension_assisted" if body.upload_status in ("uploaded", "verified") else "downloaded_for_manual_upload",
                upload_status=body.upload_status,
                employer_field_label=body.employer_field_label or row.employer_field_label,
                uploaded_at=_utcnow() if body.upload_status in ("uploaded", "verified") else None,
            )
            db.add(ad)

    db.commit()
    log_activity(
        db, owner, "upload_result",
        f"{row.document_type} upload {body.upload_status}",
        f"session={row.id}",
    )
    return {"upload_session_id": row.id, "status": row.status}


@router.post("/upload-session/cancel")
def upload_session_cancel(
    body: UploadSessionResult,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    row = (
        owned(db.query(ExtensionUploadSession), ExtensionUploadSession, owner)
        .filter(ExtensionUploadSession.id == body.upload_session_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Upload session not found.")
    if row.status not in ("used",):
        row.status = "cancelled"
        db.commit()
    return {"upload_session_id": row.id, "status": row.status}


@router.post("/submission/confirm")
def submission_confirm(
    body: SubmissionConfirm,
    request: Request,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    """Record user-confirmed submission only — never clicks employer Submit."""
    rate_limit_ext_submission(request, user_id=ext_audit.owner_audit_id(owner))
    caps = flags.effective_capabilities(owner)
    flags.require_capability(
        caps, "record_submission_confirmation", "Submission confirmation is temporarily disabled."
    )
    job = (
        owned(db.query(JobApplication), JobApplication, owner)
        .filter(JobApplication.id == body.job_application_id)
        .first()
    )
    if not job:
        raise HTTPException(status_code=404, detail="Application not found.")

    if body.save_as_in_progress:
        if job.status not in PROTECTED_ADVANCED and job.status != "Applied":
            if job.status in ("Saved", "Application Opened"):
                job.status = "Application In Progress"
        job.last_activity_at = _utcnow()
        job.updated_at = _utcnow()
        db.commit()
        log_activity(db, owner, "saved_in_progress", f"{job.company} — {job.role} saved in progress")
        return {
            "status": job.status,
            "applied": False,
            "message": "Application saved as in progress.",
            "job_application_id": job.id,
        }

    if not body.confirmed:
        raise HTTPException(status_code=422, detail="Confirmation checkbox is required.")

    if body.confirmation_url:
        try:
            p = urlparse(body.confirmation_url.strip())
            if p.scheme not in ("http", "https") or not p.netloc:
                raise HTTPException(status_code=422, detail="Confirmation URL invalid.")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=422, detail="Confirmation URL invalid.") from None

    if job.status in PROTECTED_ADVANCED:
        return {
            "status": job.status,
            "applied": False,
            "warning": f"Application is already {job.status}. Status was not overwritten.",
            "job_application_id": job.id,
        }

    now = _utcnow()
    first_apply = not job.applied_at
    job.status = "Applied"
    if first_apply:
        job.applied_at = now
    job.last_activity_at = now
    job.updated_at = now
    job.application_method = job.application_method or "assisted"
    if job.application_method == "employer_website":
        job.application_method = "assisted"
    job.confirmation_number = (body.confirmation_number or "")[:120] or None
    job.confirmation_url = (body.confirmation_url or "")[:500] or None
    job.submission_notes = body.submission_notes
    job.action_required = False
    job.action_required_reason = None

    if body.resume_document_id:
        doc = _owned_doc(db, owner, body.resume_document_id)
        job.resume_document_id = doc.id
        _ensure_app_doc(db, owner, job.id, doc, "resume", body.fill_session_id, "manual")
    if body.cover_letter_document_id:
        doc = _owned_doc(db, owner, body.cover_letter_document_id)
        job.cover_letter_document_id = doc.id
        _ensure_app_doc(db, owner, job.id, doc, "cover_letter", body.fill_session_id, "manual")

    db.commit()
    db.refresh(job)

    reminder = {}
    if first_apply and not job.follow_up_date:
        reminder = _attach_reminder_safely(db, job.id, days=7)
        db.refresh(job)

    log_activity(
        db, owner, "submission_confirmed",
        f"User confirmed submission — {job.company} — {job.role}",
        f"applied_at={job.applied_at}; resume={job.resume_document_id}; cover={job.cover_letter_document_id}",
    )
    ext_audit.log_extension_event(
        db,
        "extension.submission_confirmed",
        user_id=ext_audit.owner_audit_id(owner),
        session_id=str(body.fill_session_id or job.id),
        outcome="ok",
        extra_summary=f"job_application_id={job.id}; first_apply={first_apply}",
    )

    return {
        "status": "Applied",
        "applied": True,
        "applied_at": job.applied_at.isoformat() + "Z" if job.applied_at else None,
        "job_application_id": job.id,
        "follow_up_date": job.follow_up_date.isoformat() + "Z" if job.follow_up_date else None,
        "reminder_warning": reminder.get("reminder_warning"),
        "resume_document_id": job.resume_document_id,
        "cover_letter_document_id": job.cover_letter_document_id,
    }


def _ensure_app_doc(
    db: Session,
    owner: Owner,
    job_id: int,
    doc: SeekerDocument,
    doc_type: str,
    fill_session_id: Optional[int],
    method: str,
):
    existing = (
        db.query(ApplicationDocument)
        .filter(
            ApplicationDocument.job_application_id == job_id,
            ApplicationDocument.document_type == doc_type,
            ApplicationDocument.source_document_id == doc.id,
        )
        .first()
    )
    if existing:
        return
    db.add(ApplicationDocument(
        user_id=owner.user_id,
        guest_id=owner.guest_id,
        job_application_id=job_id,
        extension_fill_session_id=fill_session_id,
        document_type=doc_type,
        source_document_id=doc.id,
        source_document_version=doc.version_number,
        file_name=doc.file_name,
        mime_type=doc.mime_type,
        file_size=doc.file_size,
        upload_method=method,
        upload_status="selected",
        uploaded_at=_utcnow(),
    ))
