"""Phase 5 M1 — browser extension auth + read-only diagnostics."""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from auth import Owner, get_owner, owned, log_activity
from database import get_db
from models import ExtensionDiagnostic, ExtensionAuthChallenge, ExtensionFillSession, JobApplication
from services import extension_auth as ext_auth
from services import extension_fill as fill_svc
from services import extension_flags as flags
from services import extension_audit as ext_audit
from services.application_url import normalize_application_url
from services.extension_config import load_extension_config
from services.rate_limit import (
    rate_limit_ext_auth_challenge,
    rate_limit_ext_token_exchange,
    rate_limit_ext_token_refresh,
    rate_limit_ext_diagnostics,
    rate_limit_ext_fill,
    rate_limit_ext_mapping,
)

router = APIRouter()

FORBIDDEN_FIELD_KEYS = frozenset({
    "value", "values", "answer", "answers", "password", "cookie", "cookies",
    "captcha", "html", "raw_html", "page_html", "resume_content", "file_content",
})


class AuthStartRequest(BaseModel):
    challenge: str = Field(min_length=8, max_length=64)
    extension_version: Optional[str] = None


class AuthConfirmRequest(BaseModel):
    challenge: str = Field(min_length=8, max_length=64)


class AuthExchangeRequest(BaseModel):
    challenge: str = Field(min_length=8, max_length=64)


class AuthRefreshRequest(BaseModel):
    refresh_token: str


class AuthRevokeRequest(BaseModel):
    refresh_token: Optional[str] = None


class DetectedFieldIn(BaseModel):
    external_field_key: str = ""
    field_label: str = ""
    field_type: str = "text"
    is_required: bool = False
    is_upload: bool = False
    normalized_field_name: Optional[str] = None
    classification: str = "unknown"
    options: list[str] = []
    confidence: float = 0.0

    @field_validator("options")
    @classmethod
    def cap_options(cls, v: list[str]) -> list[str]:
        return [str(x)[:200] for x in (v or [])[:50]]


class DiagnosticCreate(BaseModel):
    job_id: Optional[int] = None
    application_url: Optional[str] = None
    platform: Optional[str] = None
    employer: Optional[str] = None
    job_title: Optional[str] = None
    detected_fields: list[DetectedFieldIn] = []
    supported_count: int = 0
    sensitive_count: int = 0
    unsupported_count: int = 0
    detector_version: Optional[str] = None
    extension_version: Optional[str] = None
    analyzed_at: Optional[datetime] = None

    @field_validator("detected_fields")
    @classmethod
    def reject_values(cls, fields: list[DetectedFieldIn]) -> list[DetectedFieldIn]:
        for f in fields:
            raw = f.model_dump()
            for k in FORBIDDEN_FIELD_KEYS:
                if k in raw and raw[k] not in (None, [], "", 0, False):
                    # options are allowed (structural); skip
                    if k == "options":
                        continue
                    raise ValueError(f"Forbidden diagnostic field key: {k}")
        return fields


class DiagnosticResponse(BaseModel):
    id: int
    platform: Optional[str] = None
    employer: Optional[str] = None
    job_title: Optional[str] = None
    supported_count: int
    sensitive_count: int
    unsupported_count: int
    detector_version: Optional[str] = None
    extension_version: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("/auth/start")
def auth_start(body: AuthStartRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit_ext_auth_challenge(request)
    if not flags.load_flags().extension_enabled:
        raise HTTPException(status_code=503, detail="Extension assistance is temporarily disabled.")
    row = ext_auth.create_challenge(db, body.challenge, body.extension_version)
    return {
        "challenge": row.challenge,
        "expires_at": row.expires_at.isoformat() + "Z",
        "status": row.status,
    }


@router.post("/auth/confirm")
def auth_confirm(
    body: AuthConfirmRequest,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    if not flags.load_flags().extension_enabled:
        raise HTTPException(status_code=503, detail="Extension assistance is temporarily disabled.")
    row = ext_auth.confirm_challenge(db, body.challenge, owner)
    return {
        "status": "confirmed",
        "challenge": row.challenge,
        "message": "Return to the JobLens extension — it will finish connecting automatically.",
    }


@router.post("/auth/exchange")
def auth_exchange(body: AuthExchangeRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit_ext_token_exchange(request)
    tokens = ext_auth.exchange_challenge(db, body.challenge)
    if not tokens:
        # Pending or unknown — 202 so extension keeps polling
        return Response(status_code=status.HTTP_202_ACCEPTED)
    return tokens


@router.post("/auth/refresh")
def auth_refresh(body: AuthRefreshRequest, request: Request, db: Session = Depends(get_db)):
    rate_limit_ext_token_refresh(request)
    return ext_auth.refresh_token_pair(db, body.refresh_token)


@router.post("/auth/revoke")
def auth_revoke(
    body: AuthRevokeRequest,
    db: Session = Depends(get_db),
):
    count = ext_auth.revoke_by_refresh(db, body.refresh_token, None)
    return {"revoked": count}


@router.get("/status")
def extension_status(owner: Owner = Depends(ext_auth.owner_from_extension_token)):
    cfg = load_extension_config()
    caps = flags.effective_capabilities(owner)
    return {
        "connected": True,
        "owner_type": "user" if owner.user_id is not None else "guest",
        "extension_version_supported": True,
        "min_extension_version": cfg.min_extension_version,
        "scope": ext_auth.TOKEN_SCOPE_ASSIST,
        "capabilities": {
            "analyze_form": caps["analyze_form"],
            "save_diagnostic": caps["save_diagnostic"],
            "fill_form": caps["fill_form"],
            "fill_uploads": caps["fill_uploads"],
            "upload_resume": caps["upload_resume"],
            "submit_application": False,
            "record_submission_confirmation": caps["record_submission_confirmation"],
        },
        "flags": {
            "extension_enabled": caps["extension_enabled"],
            "greenhouse_enabled": caps["greenhouse_enabled"],
            "pilot_user": caps["pilot_user"],
            "automatic_submission_enabled": False,
        },
        "versions": {
            "api_contract": "4.0.0-m4",
            "document_upload": "1.0.0-m3",
            "fill_engine": "1.0.0-m2",
            "detector": "1.0.0-m3",
        },
    }


@router.post("/diagnostics", response_model=DiagnosticResponse, status_code=201)
def create_diagnostic(
    body: DiagnosticCreate,
    request: Request,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    rate_limit_ext_diagnostics(request, user_id=ext_audit.owner_audit_id(owner))
    caps = flags.effective_capabilities(owner)
    flags.require_capability(caps, "save_diagnostic")

    # Sanitize fields — drop any unexpected keys by re-serializing DetectedFieldIn only
    clean_fields: list[dict[str, Any]] = []
    for f in body.detected_fields:
        d = f.model_dump()
        for banned in FORBIDDEN_FIELD_KEYS:
            d.pop(banned, None)
        clean_fields.append(d)

    classified = normalize_application_url(body.application_url)
    url = classified.normalized_url if classified.is_valid else None
    platform = body.platform or (classified.platform if classified.is_valid else None)

    row = ExtensionDiagnostic(
        user_id=owner.user_id,
        guest_id=owner.guest_id,
        job_id=body.job_id,
        application_url_normalized=url,
        platform=platform,
        employer=(body.employer or "")[:255] or None,
        job_title=(body.job_title or "")[:255] or None,
        detected_fields_json=json.dumps(clean_fields),
        supported_count=body.supported_count,
        sensitive_count=body.sensitive_count,
        unsupported_count=body.unsupported_count,
        detector_version=body.detector_version,
        extension_version=body.extension_version,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    ext_audit.log_extension_event(
        db,
        "extension.form_analyzed",
        user_id=ext_audit.owner_audit_id(owner),
        session_id=str(row.id),
        platform=platform,
        extension_version=body.extension_version,
        outcome="ok",
        extra_summary=f"supported={body.supported_count} sensitive={body.sensitive_count}",
    )
    return row


@router.get("/diagnostics/{diagnostic_id}", response_model=DiagnosticResponse)
def get_diagnostic(
    diagnostic_id: int,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    row = (
        owned(db.query(ExtensionDiagnostic), ExtensionDiagnostic, owner)
        .filter(ExtensionDiagnostic.id == diagnostic_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Diagnostic not found.")
    return row


@router.get("/auth/challenge/{challenge}")
def challenge_status(challenge: str, db: Session = Depends(get_db)):
    """Public status for connect UI (no tokens)."""
    row = db.query(ExtensionAuthChallenge).filter(ExtensionAuthChallenge.challenge == challenge).first()
    if not row:
        raise HTTPException(status_code=404, detail="Challenge not found.")
    return {
        "challenge": row.challenge,
        "status": row.status,
        "expires_at": row.expires_at.isoformat() + "Z",
    }


# --- M2 fill sessions ---

FILL_SESSION_TTL_MINUTES = 30
PROTECTED_STATUSES = {"Interviewing", "Offer", "Rejected", "Withdrawn", "Applied"}


class FillSessionStartRequest(BaseModel):
    job_id: Optional[int] = None
    job_requirement_id: Optional[int] = None
    application_url: Optional[str] = None
    platform: str = "greenhouse"
    detected_fields: list[DetectedFieldIn] = []
    detector_version: Optional[str] = None
    extension_version: Optional[str] = None


class FillSessionMapRequest(BaseModel):
    fill_session_id: int
    detected_fields: list[DetectedFieldIn] = []


class FillSessionResultRequest(BaseModel):
    fill_session_id: int
    successful_fields: list[str] = []
    skipped_fields: list[str] = []
    failed_fields: list[str] = []
    unsupported_fields: list[str] = []
    missing_fields: list[str] = []
    user_reviewed_sensitive_fields: list[str] = []
    completed_at: Optional[datetime] = None


def _get_owned_session(db: Session, owner: Owner, session_id: int) -> ExtensionFillSession:
    row = (
        owned(db.query(ExtensionFillSession), ExtensionFillSession, owner)
        .filter(ExtensionFillSession.id == session_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Fill session not found.")
    if row.expires_at < datetime.utcnow():
        row.status = "expired"
        db.commit()
        raise HTTPException(status_code=410, detail="Fill session expired.")
    return row


def _clean_detected(fields: list[DetectedFieldIn]) -> list[dict[str, Any]]:
    clean: list[dict[str, Any]] = []
    for f in fields:
        d = f.model_dump()
        for banned in FORBIDDEN_FIELD_KEYS:
            d.pop(banned, None)
        clean.append(d)
    return clean


@router.post("/fill-session/start")
def fill_session_start(
    body: FillSessionStartRequest,
    request: Request,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    rate_limit_ext_fill(request, user_id=ext_audit.owner_audit_id(owner))
    caps = flags.effective_capabilities(owner)
    flags.require_capability(caps, "fill_form", "Assisted fill is not enabled for this account.")
    if not caps.get("greenhouse_enabled"):
        raise HTTPException(status_code=403, detail="Greenhouse assistance is disabled.")
    if (body.platform or "").lower() != "greenhouse":
        raise HTTPException(status_code=422, detail="Only Greenhouse is supported in M2.")

    classified = normalize_application_url(body.application_url)
    url = classified.normalized_url if classified.is_valid else None
    clean = _clean_detected(body.detected_fields)
    values = fill_svc.build_profile_value_map(db, owner)
    readiness = fill_svc.readiness_summary(values, owner)

    now = datetime.utcnow()
    row = ExtensionFillSession(
        user_id=owner.user_id,
        guest_id=owner.guest_id,
        job_id=body.job_id,
        job_requirement_id=body.job_requirement_id,
        application_url_normalized=url,
        platform="greenhouse",
        status="created",
        detected_fields_json=json.dumps(clean),
        requested_fields_json="[]",
        approved_fields_json="[]",
        successful_fields_json="[]",
        skipped_fields_json="[]",
        failed_fields_json="[]",
        missing_fields_json="[]",
        detector_version=body.detector_version,
        extension_version=body.extension_version,
        started_at=now,
        expires_at=now + timedelta(minutes=FILL_SESSION_TTL_MINUTES),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    ext_audit.log_extension_event(
        db,
        "extension.fill_session_started",
        user_id=ext_audit.owner_audit_id(owner),
        session_id=str(row.id),
        platform="greenhouse",
        extension_version=body.extension_version,
        outcome="ok",
    )

    return {
        "fill_session_id": row.id,
        "status": row.status,
        "expires_at": row.expires_at.isoformat() + "Z",
        "permitted_normalized_fields": fill_svc.permitted_normalized_fields(),
        "profile_readiness": readiness,
        "capabilities": {
            "fill_form": caps["fill_form"],
            "upload_resume": caps["upload_resume"],
            "submit_application": False,
            "record_submission_confirmation": caps["record_submission_confirmation"],
        },
    }


@router.post("/fill-session/map")
def fill_session_map(
    body: FillSessionMapRequest,
    request: Request,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    rate_limit_ext_mapping(request, user_id=ext_audit.owner_audit_id(owner))
    caps = flags.effective_capabilities(owner)
    flags.require_capability(caps, "fill_form")
    row = _get_owned_session(db, owner, body.fill_session_id)
    detected = _clean_detected(body.detected_fields) if body.detected_fields else json.loads(row.detected_fields_json or "[]")

    values = fill_svc.build_profile_value_map(db, owner)
    mappings = fill_svc.map_detected_fields(detected, values)

    requested = [m["normalized_field_name"] for m in mappings if m.get("normalized_field_name")]
    approved = [
        m["normalized_field_name"]
        for m in mappings
        if m.get("mapping_status") == "Ready" and m.get("normalized_field_name")
    ]
    # Store names only — never persist approved_value on the session row
    row.detected_fields_json = json.dumps(detected)
    row.requested_fields_json = json.dumps(requested)
    row.approved_fields_json = json.dumps(approved)
    row.status = "awaiting_review"
    row.reviewed_at = datetime.utcnow()
    row.updated_at = datetime.utcnow()
    db.commit()
    ext_audit.log_extension_event(
        db,
        "extension.fill_approved",
        user_id=ext_audit.owner_audit_id(owner),
        session_id=str(row.id),
        platform=row.platform,
        outcome="ok",
        extra_summary=f"approved_count={len(approved)}",
    )

    readiness = fill_svc.readiness_summary(values, owner)
    return {
        "fill_session_id": row.id,
        "status": row.status,
        "profile_readiness": readiness,
        "mappings": mappings,
    }


@router.post("/fill-session/result")
def fill_session_result(
    body: FillSessionResultRequest,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    row = _get_owned_session(db, owner, body.fill_session_id)

    # Reject payloads that look like they include values
    for name_list in (
        body.successful_fields,
        body.skipped_fields,
        body.failed_fields,
        body.unsupported_fields,
        body.missing_fields,
        body.user_reviewed_sensitive_fields,
    ):
        for item in name_list:
            if "=" in item or ":" in item and len(item) > 80:
                raise HTTPException(status_code=422, detail="Result payload must contain field names only.")

    row.successful_fields_json = json.dumps(body.successful_fields)
    row.skipped_fields_json = json.dumps(body.skipped_fields)
    row.failed_fields_json = json.dumps(body.failed_fields)
    row.missing_fields_json = json.dumps(body.missing_fields)
    row.filled_at = datetime.utcnow()
    row.completed_at = body.completed_at or datetime.utcnow()
    if body.failed_fields and body.successful_fields:
        row.status = "partially_filled"
    elif body.failed_fields and not body.successful_fields:
        row.status = "failed"
    elif body.successful_fields:
        row.status = "filled"
    else:
        row.status = "partially_filled"
    row.updated_at = datetime.utcnow()

    tracker_id = None
    action_required = bool(body.missing_fields or body.unsupported_fields or body.failed_fields)
    if row.job_id:
        job = (
            owned(db.query(JobApplication), JobApplication, owner)
            .filter(JobApplication.id == row.job_id)
            .first()
        )
        if job:
            tracker_id = job.id
            if job.status not in PROTECTED_STATUSES:
                if job.status in ("Saved", "Application Opened", "Recruiter Contacted"):
                    # Recruiter Contacted → not in ALLOWED to In Progress; only Saved/Opened
                    if job.status in ("Saved", "Application Opened"):
                        job.status = "Application In Progress"
                elif job.status == "Application In Progress":
                    pass
            if not job.application_method:
                job.application_method = "assisted"
            elif job.application_method == "employer_website":
                job.application_method = "assisted"
            job.last_activity_at = datetime.utcnow()
            if action_required:
                job.action_required = True
                job.action_required_reason = "Manual fields remain after JobLens assisted fill"
            filled_n = len(body.successful_fields)
            manual_n = len(body.missing_fields) + len(body.unsupported_fields)

    db.commit()
    db.refresh(row)

    event = "extension.fill_completed" if row.status == "filled" else "extension.fill_partial"
    ext_audit.log_extension_event(
        db,
        event,
        user_id=ext_audit.owner_audit_id(owner),
        session_id=str(row.id),
        platform=row.platform,
        outcome="ok" if row.status != "failed" else "failure",
        extra_summary=f"status={row.status}; filled={len(body.successful_fields)}; failed={len(body.failed_fields)}",
    )

    if tracker_id is not None:
        log_activity(
            db,
            owner,
            "assisted_fill",
            "JobLens assisted fill completed.",
            f"filled={len(body.successful_fields)}; manual={len(body.missing_fields) + len(body.unsupported_fields)}; platform=greenhouse",
        )

    return {
        "fill_session_id": row.id,
        "status": row.status,
        "job_application_id": tracker_id,
        "action_required": action_required,
    }


class FeedbackRequest(BaseModel):
    category: str = Field(description="Issue category")
    message: Optional[str] = Field(default=None, max_length=500)
    platform: Optional[str] = "greenhouse"
    detector_version: Optional[str] = None
    extension_version: Optional[str] = None
    error_code: Optional[str] = None
    feature_stage: Optional[str] = None

    @field_validator("category")
    @classmethod
    def valid_category(cls, v: str) -> str:
        allowed = {
            "form_not_detected",
            "wrong_field_mapping",
            "field_not_filled",
            "incorrect_highlight",
            "document_upload_failed",
            "undo_failed",
            "connection_failed",
            "privacy_concern",
            "other",
        }
        if v not in allowed:
            raise ValueError(f"Invalid feedback category: {v}")
        return v


@router.post("/feedback", status_code=201)
def extension_feedback(
    body: FeedbackRequest,
    request: Request,
    owner: Owner = Depends(ext_auth.owner_from_extension_token),
    db: Session = Depends(get_db),
):
    from services.rate_limit import rate_limit_ext_feedback

    rate_limit_ext_feedback(request, user_id=ext_audit.owner_audit_id(owner))
    # Never accept filled values / HTML / credentials in feedback.
    msg = (body.message or "").strip()
    for banned in ("password", "<html", "Bearer ", "cookie="):
        if banned.lower() in msg.lower():
            msg = "[redacted]"
            break
    ext_audit.log_extension_event(
        db,
        "extension.feedback_submitted",
        user_id=ext_audit.owner_audit_id(owner),
        platform=body.platform,
        extension_version=body.extension_version,
        outcome="ok",
        error_code=body.error_code,
        extra_summary=f"category={body.category}; stage={body.feature_stage or ''}; note={msg[:120]}",
    )
    return {
        "received": True,
        "category": body.category,
        "message": "Thanks — your report was recorded without form values or document contents.",
    }


class EmergencyAction(BaseModel):
    action: str
    admin_token: str
    extension_version: Optional[str] = None


@router.post("/ops/emergency")
def extension_emergency(
    body: EmergencyAction,
    db: Session = Depends(get_db),
):
    """Rollback / kill-switch actions. Requires EXTENSION_OPS_TOKEN env secret."""
    import os

    expected = os.getenv("EXTENSION_OPS_TOKEN", "").strip()
    if not expected or body.admin_token != expected:
        raise HTTPException(status_code=403, detail="Forbidden.")

    action = body.action
    if action == "revoke_all_tokens":
        n = ext_auth.revoke_all_extension_tokens(db)
        return {"ok": True, "revoked": n}
    if action == "block_version":
        # Documented via EXTENSION_BLOCKED_VERSIONS env — runtime note only.
        return {
            "ok": True,
            "message": (
                f"Set EXTENSION_BLOCKED_VERSIONS to include {body.extension_version} "
                "and restart, or set EXTENSION_ENABLED=false."
            ),
        }
    if action in (
        "disable_extension",
        "disable_fill",
        "disable_upload",
        "disable_diagnostics",
    ):
        return {
            "ok": True,
            "message": (
                "Set the matching env flag (EXTENSION_ENABLED / "
                "EXTENSION_ASSISTED_FILL_ENABLED / EXTENSION_DOCUMENT_UPLOAD_ENABLED / "
                "EXTENSION_DIAGNOSTICS_ENABLED) to false and restart. Prefer feature flags "
                "over database downgrades."
            ),
            "action": action,
        }
    raise HTTPException(status_code=422, detail="Unknown emergency action.")
