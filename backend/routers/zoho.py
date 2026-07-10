"""Zoho Mail OAuth + email import for the ATS."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CreateJobFromEmailResponse,
    EmailClassificationResponse,
    EmailClassifyBatchResponse,
    ImportedEmail,
    ImportedEmailDetailResponse,
    ImportedEmailResponse,
    ImportedEmailUpdate,
    JobRequirement,
    JobRequirementCreate,
    JobRequirementParseResponse,
    ZohoAuthorizeResponse,
    ZohoConnection,
    ZohoConnectionStatus,
    ZohoOAuthCallbackRequest,
    ZohoOAuthState,
    ZohoSyncResponse,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from routers.job_requirements import _auto_link_crm, _prepare_create_data, _to_response
from services.audit import log_audit
from services.claude_service import parse_job_requirement
from services.email_classifier import classify_email
from services.html_sanitize import sanitize_email_html
from services.rate_limit import rate_limit_ai, rate_limit_zoho
from services.token_crypto import encrypt_token
from services.zoho_client import (
    ZohoApiError,
    ZohoConfigError,
    ZOHO_SCOPES,
    build_authorize_url,
    ensure_access_token,
    exchange_code_for_tokens,
    fetch_inbox_folder_id,
    fetch_message_content,
    fetch_primary_account,
    list_inbox_messages,
    new_oauth_state,
)

router = APIRouter()

STATE_TTL_MINUTES = 15
SYNC_LIMIT = 50


def _user_key(principal: AtsPrincipal) -> str:
    return principal.user_id or "local-dev-user"


def _get_connection(db: Session, user_id: str) -> ZohoConnection | None:
    return db.query(ZohoConnection).filter(ZohoConnection.user_id == user_id).first()


def _connection_status(conn: ZohoConnection | None) -> ZohoConnectionStatus:
    if not conn or conn.status != "Active" or not conn.encrypted_refresh_token:
        return ZohoConnectionStatus(connected=False, status=conn.status if conn else "Disconnected")
    return ZohoConnectionStatus(
        connected=True,
        status=conn.status,
        mailbox_email=conn.mailbox_email,
        zoho_account_id=conn.zoho_account_id,
        last_sync_at=conn.last_sync_at,
        last_error=conn.last_error,
    )


def _parse_sender(raw: str | None) -> tuple[str | None, str | None]:
    if not raw:
        return None, None
    if "<" in raw and ">" in raw:
        name = raw.split("<")[0].strip().strip('"')
        addr = raw.split("<")[1].split(">")[0].strip()
        return addr or None, name or None
    return raw.strip(), None


def _ms_to_dt(ms: int | str | None) -> datetime | None:
    if ms is None:
        return None
    try:
        val = int(ms)
        return datetime.fromtimestamp(val / 1000, tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


@router.get("/oauth/authorize", response_model=ZohoAuthorizeResponse)
async def zoho_authorize(
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    user_id = _user_key(principal)
    try:
        state = new_oauth_state()
        db.add(ZohoOAuthState(
            state=state,
            user_id=user_id,
            expires_at=datetime.utcnow() + timedelta(minutes=STATE_TTL_MINUTES),
        ))
        db.commit()
        return ZohoAuthorizeResponse(authorize_url=build_authorize_url(state))
    except ZohoConfigError as e:
        raise HTTPException(status_code=503, detail=str(e))


@router.post("/oauth/callback", response_model=ZohoConnectionStatus)
async def zoho_oauth_callback(
    body: ZohoOAuthCallbackRequest,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    user_id = _user_key(principal)
    row = db.query(ZohoOAuthState).filter(ZohoOAuthState.state == body.state).first()
    if not row or row.user_id != user_id:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state.")
    if row.expires_at < datetime.utcnow():
        db.delete(row)
        db.commit()
        raise HTTPException(status_code=400, detail="OAuth state expired. Try connecting again.")

    try:
        tokens = exchange_code_for_tokens(body.code)
    except ZohoApiError as e:
        raise HTTPException(status_code=502, detail=str(e))
    finally:
        db.delete(row)
        db.commit()

    refresh = tokens.get("refresh_token")
    if not refresh:
        raise HTTPException(
            status_code=502,
            detail="Zoho did not return a refresh token. Disconnect the app in Zoho and reconnect with consent.",
        )

    conn = _get_connection(db, user_id)
    if not conn:
        conn = ZohoConnection(user_id=user_id)
        db.add(conn)

    conn.encrypted_refresh_token = encrypt_token(refresh)
    conn.access_token = tokens.get("access_token")
    expires_in = int(tokens.get("expires_in", 3600))
    conn.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
    conn.api_domain = tokens.get("api_domain")
    conn.scopes = ZOHO_SCOPES
    conn.status = "Active"
    conn.last_error = None

    try:
        access = ensure_access_token(db, conn)
        account = fetch_primary_account(conn, access)
        conn.zoho_account_id = str(account.get("accountId") or "")
        conn.mailbox_email = (
            account.get("primaryEmailAddress")
            or account.get("mailboxAddress")
            or (account.get("emailAddress") or [{}])[0].get("mailId")
        )
        if conn.zoho_account_id:
            conn.inbox_folder_id = fetch_inbox_folder_id(conn, access, conn.zoho_account_id)
    except ZohoApiError as e:
        conn.last_error = str(e)
        conn.status = "Error"

    db.commit()
    db.refresh(conn)
    log_audit(db, "zoho.connected", "zoho_connection", conn.id, "Connected Zoho Mail", principal.user_id)
    return _connection_status(conn)


@router.get("/connection", response_model=ZohoConnectionStatus)
async def zoho_connection_status(
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    conn = _get_connection(db, _user_key(principal))
    if conn and conn.status == "Error" and conn.encrypted_refresh_token:
        try:
            access = ensure_access_token(db, conn)
            account = fetch_primary_account(conn, access)
            conn.zoho_account_id = str(account.get("accountId") or "")
            conn.mailbox_email = (
                account.get("primaryEmailAddress")
                or account.get("mailboxAddress")
                or (account.get("emailAddress") or [{}])[0].get("mailId")
            )
            if conn.zoho_account_id:
                conn.inbox_folder_id = fetch_inbox_folder_id(conn, access, conn.zoho_account_id)
            conn.status = "Active"
            conn.last_error = None
            db.commit()
            db.refresh(conn)
        except ZohoApiError:
            pass
    return _connection_status(conn)


@router.delete("/connection", response_model=ZohoConnectionStatus)
async def zoho_disconnect(
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    conn = _get_connection(db, _user_key(principal))
    if conn:
        conn.encrypted_refresh_token = None
        conn.access_token = None
        conn.token_expires_at = None
        conn.status = "Disconnected"
        conn.last_error = None
        db.commit()
        db.refresh(conn)
        log_audit(db, "zoho.disconnected", "zoho_connection", conn.id, "Disconnected Zoho Mail", principal.user_id)
    return _connection_status(conn)


@router.post("/sync", response_model=ZohoSyncResponse)
async def zoho_sync(
    request: Request,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    rate_limit_zoho(request, principal.user_id)
    conn = _get_connection(db, _user_key(principal))
    if not conn or not conn.encrypted_refresh_token or conn.status == "Disconnected":
        raise HTTPException(status_code=400, detail="Zoho Mail is not connected.")

    try:
        access = ensure_access_token(db, conn)
        if not conn.zoho_account_id:
            account = fetch_primary_account(conn, access)
            conn.zoho_account_id = str(account.get("accountId") or "")
            conn.mailbox_email = account.get("primaryEmailAddress") or conn.mailbox_email
        if not conn.inbox_folder_id and conn.zoho_account_id:
            conn.inbox_folder_id = fetch_inbox_folder_id(conn, access, conn.zoho_account_id)
        db.commit()

        messages = list_inbox_messages(
            conn, access, conn.zoho_account_id, conn.inbox_folder_id,
            start=1, limit=SYNC_LIMIT,
        )

        imported = 0
        skipped = 0
        for msg in messages:
            message_id = str(msg.get("messageId") or msg.get("id") or "")
            if not message_id:
                skipped += 1
                continue
            exists = (
                db.query(ImportedEmail)
                .filter(
                    ImportedEmail.zoho_connection_id == conn.id,
                    ImportedEmail.zoho_message_id == message_id,
                )
                .first()
            )
            if exists:
                skipped += 1
                continue

            from_raw = msg.get("fromAddress") or msg.get("sender") or msg.get("from")
            from_addr, from_name = _parse_sender(from_raw if isinstance(from_raw, str) else None)
            if isinstance(from_raw, dict):
                from_addr = from_raw.get("email") or from_addr
                from_name = from_raw.get("name") or from_name

            body_text = None
            body_html = None
            try:
                content = fetch_message_content(conn, access, conn.zoho_account_id, message_id)
                body_text = content.get("content") or content.get("text") or content.get("plainText")
                body_html = content.get("html") or content.get("htmlContent")
            except ZohoApiError:
                pass

            db.add(ImportedEmail(
                zoho_connection_id=conn.id,
                zoho_message_id=message_id,
                folder_id=conn.inbox_folder_id,
                from_address=from_addr,
                from_name=from_name,
                subject=msg.get("subject"),
                body_text=body_text,
                body_html=body_html,
                received_at=_ms_to_dt(msg.get("receivedTime") or msg.get("sentDateInGMT")),
                classification="unclassified",
                needs_review=True,
            ))
            imported += 1

        conn.last_sync_at = datetime.utcnow()
        conn.last_error = None
        conn.status = "Active"
        db.commit()
        log_audit(
            db, "zoho.sync", "zoho_connection", conn.id,
            f"Synced {imported} new emails ({skipped} skipped)", principal.user_id,
        )
        return ZohoSyncResponse(imported=imported, skipped=skipped, total_fetched=len(messages))
    except ZohoApiError as e:
        conn.last_error = str(e)
        conn.status = "Error"
        db.commit()
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/emails", response_model=list[ImportedEmailResponse])
async def list_imported_emails(
    classification: str | None = Query(None),
    needs_review: bool | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    conn = _get_connection(db, _user_key(principal))
    if not conn:
        return []

    q = db.query(ImportedEmail).filter(ImportedEmail.zoho_connection_id == conn.id)
    if classification:
        q = q.filter(ImportedEmail.classification == classification)
    if needs_review is not None:
        q = q.filter(ImportedEmail.needs_review == needs_review)
    rows = q.order_by(ImportedEmail.received_at.desc(), ImportedEmail.id.desc()).limit(limit).all()
    return [ImportedEmailResponse.model_validate(r) for r in rows]


def _strip_html(html: str | None) -> str:
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


def _email_body_text(email: ImportedEmail) -> str:
    return (email.body_text or _strip_html(email.body_html) or "").strip()


def _email_raw_text(email: ImportedEmail) -> str:
    parts: list[str] = []
    if email.subject:
        parts.append(f"Subject: {email.subject}")
    from_line = " ".join(p for p in [email.from_name, f"<{email.from_address}>" if email.from_address else ""] if p).strip()
    if from_line:
        parts.append(f"From: {from_line}")
    body = _email_body_text(email)
    if body:
        parts.append(body)
    return "\n\n".join(parts)


def _get_owned_email(db: Session, principal: AtsPrincipal, email_id: int) -> ImportedEmail:
    conn = _get_connection(db, _user_key(principal))
    if not conn:
        raise HTTPException(status_code=404, detail="Imported email not found.")
    email = (
        db.query(ImportedEmail)
        .filter(ImportedEmail.id == email_id, ImportedEmail.zoho_connection_id == conn.id)
        .first()
    )
    if not email:
        raise HTTPException(status_code=404, detail="Imported email not found.")
    return email


def _classification_response(email: ImportedEmail, reason: str = "") -> EmailClassificationResponse:
    return EmailClassificationResponse(
        id=email.id,
        classification=email.classification,
        reason=reason,
        needs_review=email.needs_review,
    )


@router.post("/emails/classify-unclassified", response_model=EmailClassifyBatchResponse)
async def classify_unclassified_emails(
    request: Request,
    limit: int = Query(25, ge=1, le=100),
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    rate_limit_ai(request, principal.user_id)
    conn = _get_connection(db, _user_key(principal))
    if not conn:
        return EmailClassifyBatchResponse(classified=0, results=[])

    rows = (
        db.query(ImportedEmail)
        .filter(
            ImportedEmail.zoho_connection_id == conn.id,
            ImportedEmail.classification == "unclassified",
        )
        .order_by(ImportedEmail.received_at.desc(), ImportedEmail.id.desc())
        .limit(limit)
        .all()
    )

    results: list[EmailClassificationResponse] = []
    for email in rows:
        try:
            result = await classify_email(
                from_name=email.from_name,
                from_address=email.from_address,
                subject=email.subject,
                body_text=_email_body_text(email),
            )
            email.classification = result["classification"]
            email.needs_review = result["classification"] == "job_req"
            results.append(_classification_response(email, result["reason"]))
        except Exception as e:
            results.append(EmailClassificationResponse(
                id=email.id,
                classification=email.classification,
                reason=f"Classification failed: {e}",
                needs_review=email.needs_review,
            ))

    db.commit()
    return EmailClassifyBatchResponse(classified=len(results), results=results)


@router.get("/emails/{email_id}", response_model=ImportedEmailDetailResponse)
async def get_imported_email(
    email_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    email = _get_owned_email(db, principal, email_id)
    payload = ImportedEmailDetailResponse.model_validate(email)
    payload.body_html = sanitize_email_html(payload.body_html)
    return payload


@router.post("/emails/{email_id}/classify", response_model=EmailClassificationResponse)
async def classify_imported_email(
    email_id: int,
    request: Request,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    rate_limit_ai(request, principal.user_id)
    email = _get_owned_email(db, principal, email_id)
    try:
        result = await classify_email(
            from_name=email.from_name,
            from_address=email.from_address,
            subject=email.subject,
            body_text=_email_body_text(email),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI classification failed: {e}")

    email.classification = result["classification"]
    email.needs_review = result["classification"] == "job_req"
    db.commit()
    db.refresh(email)
    return _classification_response(email, result["reason"])


@router.post("/emails/{email_id}/parse", response_model=JobRequirementParseResponse)
async def parse_imported_email(
    email_id: int,
    request: Request,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    rate_limit_ai(request, principal.user_id)
    email = _get_owned_email(db, principal, email_id)
    raw_text = _email_raw_text(email)
    if len(raw_text.strip()) < 20:
        raise HTTPException(status_code=422, detail="Email body is too short to parse.")
    try:
        parsed = await parse_job_requirement(raw_text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")

    if not parsed.get("recruiter_email") and email.from_address:
        parsed["recruiter_email"] = email.from_address
    if not parsed.get("recruiter_name") and email.from_name:
        parsed["recruiter_name"] = email.from_name
    return JobRequirementParseResponse(**{k: v for k, v in parsed.items() if k != "rate"})


@router.post("/emails/{email_id}/create-job", response_model=CreateJobFromEmailResponse, status_code=201)
async def create_job_from_email(
    email_id: int,
    body: JobRequirementCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    email = _get_owned_email(db, principal, email_id)
    if email.job_requirement_id:
        existing = db.query(JobRequirement).filter(JobRequirement.id == email.job_requirement_id).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"This email is already linked to job #{existing.id}.",
            )

    data = _prepare_create_data(body.model_dump())
    data = _auto_link_crm(db, data)
    if not data.get("source"):
        data["source"] = "Zoho Mail"
    if not data.get("raw_email_text"):
        data["raw_email_text"] = _email_raw_text(email)
    if not data.get("received_at"):
        data["received_at"] = email.received_at
    if principal.user_id:
        data["created_by"] = principal.user_id

    job = JobRequirement(**data)
    db.add(job)
    db.flush()

    email.job_requirement_id = job.id
    email.classification = "job_req"
    email.needs_review = False
    db.commit()
    db.refresh(job)
    db.refresh(email)
    log_audit(
        db, "zoho.job_created", "job_requirement", job.id,
        f"Created job from email #{email_id}: {job.job_title}", principal.user_id,
    )
    return CreateJobFromEmailResponse(
        email=ImportedEmailResponse.model_validate(email),
        job=_to_response(job),
    )


@router.patch("/emails/{email_id}", response_model=ImportedEmailResponse)
async def update_imported_email(
    email_id: int,
    body: ImportedEmailUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    email = _get_owned_email(db, principal, email_id)
    if body.classification is not None:
        email.classification = body.classification
    if body.needs_review is not None:
        email.needs_review = body.needs_review
    db.commit()
    db.refresh(email)
    return ImportedEmailResponse.model_validate(email)
