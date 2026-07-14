"""Zoho Mail OAuth + email import for the ATS."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CreateJobFromEmailResponse,
    CRMActivity,
    CRMContact,
    CRMOrganization,
    EmailClassificationResponse,
    EmailClassifyBatchResponse,
    ImportedEmail,
    ImportedEmailDetailResponse,
    ImportedEmailResponse,
    ImportedEmailUpdate,
    JobRequirement,
    JobRequirementCreate,
    JobRequirementParseResponse,
    LinkEmailToJobRequest,
    ZohoAuthorizeResponse,
    ZohoConnection,
    ZohoConnectionStatus,
    ZohoOAuthCallbackRequest,
    ZohoOAuthState,
    ZohoSyncResponse,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from routers.job_requirements import _auto_link_crm, _find_contact, _find_org_by_name, _prepare_create_data, _to_response
from services.audit import log_audit
from services.ai_errors import log_ai_error, raise_clean_ai_error
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
    import_status: str | None = Query(None),
    q_text: str | None = Query(None, alias="q"),
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
    if import_status:
        q = q.filter(ImportedEmail.import_status == import_status)
    if q_text and q_text.strip():
        like = f"%{q_text.strip()}%"
        q = q.filter(
            (ImportedEmail.subject.ilike(like))
            | (ImportedEmail.from_address.ilike(like))
            | (ImportedEmail.from_name.ilike(like))
        )
    rows = q.order_by(ImportedEmail.received_at.desc(), ImportedEmail.id.desc()).limit(limit).all()
    return [_email_list_response(r) for r in rows]


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


def _preview_text(email: ImportedEmail, length: int = 160) -> str:
    text = " ".join(_email_body_text(email).split())
    if len(text) > length:
        return text[: length].rstrip() + "…"
    return text


def _email_list_response(email: ImportedEmail) -> ImportedEmailResponse:
    resp = ImportedEmailResponse.model_validate(email)
    resp.preview = _preview_text(email)
    return resp


def _domain_from_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    domain = email.strip().lower().split("@")[-1].strip()
    return domain or None


def _find_or_create_org(
    db: Session, *, name: str | None, email_domain: str | None, principal: AtsPrincipal,
) -> CRMOrganization | None:
    """Find a CRM organization by name (or email domain), else create one.

    Only fills/creates when data is missing — never overwrites an existing,
    already-populated org record. Mirrors `_auto_link_crm`'s fill-only rule.
    """
    if not name or not name.strip():
        return None
    org = _find_org_by_name(db, name)
    if not org and email_domain:
        org = db.query(CRMOrganization).filter(CRMOrganization.email_domain == email_domain).first()
    if org:
        if email_domain and not org.email_domain:
            org.email_domain = email_domain
        return org
    org = CRMOrganization(
        organization_name=name.strip(),
        organization_type="Staffing Vendor",
        email_domain=email_domain,
        source="Zoho Mail",
        needs_review=True,
        created_by=principal.user_id,
    )
    db.add(org)
    db.flush()
    return org


def _find_or_create_contact(
    db: Session,
    *,
    email: str | None,
    name: str | None,
    phone: str | None,
    organization_id: int | None,
    principal: AtsPrincipal,
) -> CRMContact | None:
    """Find a CRM contact by email/name, else create one (recruiter default)."""
    if not (email and email.strip()) and not (name and name.strip()):
        return None
    contact = _find_contact(db, email, name)
    if contact:
        if phone and not contact.phone:
            contact.phone = phone
        if organization_id and not contact.organization_id:
            contact.organization_id = organization_id
        return contact
    parts = (name or "").strip().split()
    first_name = parts[0] if parts else None
    last_name = " ".join(parts[1:]) if len(parts) > 1 else None
    contact = CRMContact(
        organization_id=organization_id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        normalized_email=email.strip().lower() if email else None,
        phone=phone,
        contact_type="Recruiter",
        source="Zoho Mail",
        needs_review=True,
        created_by=principal.user_id,
    )
    db.add(contact)
    db.flush()
    return contact


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
            log_ai_error(logger, "Batch email classification", e)
            results.append(EmailClassificationResponse(
                id=email.id,
                classification=email.classification,
                reason="Classification could not be completed for this email.",
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
        raise_clean_ai_error(logger, "Email classification", e)

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
        raise_clean_ai_error(logger, "Job details parsing", e)

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

    # Create-or-update the recruiter and their company (vendor) before the
    # generic find-only auto-link fills in client/end-client — an explicit
    # vendor_id/recruiter_contact_id from the review form always wins.
    org = None
    if not data.get("vendor_id") and data.get("vendor"):
        org = _find_or_create_org(
            db,
            name=data["vendor"],
            email_domain=_domain_from_email(data.get("recruiter_email") or email.from_address),
            principal=principal,
        )
        if org:
            data["vendor_id"] = org.id
    contact = None
    if not data.get("recruiter_contact_id") and (data.get("recruiter_email") or data.get("recruiter_name")):
        contact = _find_or_create_contact(
            db,
            email=data.get("recruiter_email"),
            name=data.get("recruiter_name"),
            phone=data.get("recruiter_phone"),
            organization_id=data.get("vendor_id"),
            principal=principal,
        )
        if contact:
            data["recruiter_contact_id"] = contact.id

    data = _auto_link_crm(db, data)
    if not data.get("source"):
        data["source"] = "Zoho Mail"
    if not data.get("raw_email_text"):
        data["raw_email_text"] = _email_raw_text(email)
    if not data.get("received_at"):
        data["received_at"] = email.received_at
    if principal.user_id:
        data["created_by"] = principal.user_id

    # Never auto-publish from inbox create — staff must Approve + Publish explicitly.
    data["published_for_matching"] = False
    if not data.get("review_status"):
        data["review_status"] = "Draft"

    job = JobRequirement(**data)
    db.add(job)
    db.flush()

    email.job_requirement_id = job.id
    email.classification = "job_req"
    email.needs_review = False
    email.import_status = "imported"
    db.add(CRMActivity(
        activity_type="Job Received",
        subject=f"Job created from Zoho email: {job.job_title}",
        description=f"From {email.from_name or email.from_address or 'unknown sender'} — {email.subject or '(no subject)'}",
        organization_id=data.get("vendor_id"),
        contact_id=data.get("recruiter_contact_id"),
        job_requirement_id=job.id,
        created_by=principal.user_id,
    ))
    db.commit()
    db.refresh(job)
    db.refresh(email)
    log_audit(
        db, "zoho.job_created", "job_requirement", job.id,
        f"Created job from email #{email_id}: {job.job_title}", principal.user_id,
    )
    return CreateJobFromEmailResponse(
        email=_email_list_response(email),
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
    return _email_list_response(email)


@router.post("/emails/{email_id}/link-job", response_model=CreateJobFromEmailResponse)
async def link_email_to_job(
    email_id: int,
    body: LinkEmailToJobRequest,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    """Attach an already-imported email to an existing job (no new job created)."""
    email = _get_owned_email(db, principal, email_id)
    if email.job_requirement_id and email.job_requirement_id != body.job_requirement_id:
        raise HTTPException(
            status_code=409,
            detail=f"This email is already linked to job #{email.job_requirement_id}.",
        )
    job = db.query(JobRequirement).filter(JobRequirement.id == body.job_requirement_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job requirement not found.")

    email.job_requirement_id = job.id
    email.classification = "job_req"
    email.needs_review = False
    email.import_status = "linked"
    db.add(CRMActivity(
        activity_type="Job Received",
        subject=f"Zoho email linked to job: {job.job_title}",
        description=f"From {email.from_name or email.from_address or 'unknown sender'} — {email.subject or '(no subject)'}",
        job_requirement_id=job.id,
        created_by=principal.user_id,
    ))
    db.commit()
    db.refresh(email)
    db.refresh(job)
    log_audit(
        db, "zoho.email_linked", "job_requirement", job.id,
        f"Linked email #{email_id} to job #{job.id}", principal.user_id,
    )
    return CreateJobFromEmailResponse(email=_email_list_response(email), job=_to_response(job))


@router.post("/emails/{email_id}/ignore", response_model=ImportedEmailResponse)
async def ignore_imported_email(
    email_id: int,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    email = _get_owned_email(db, principal, email_id)
    email.import_status = "ignored"
    email.needs_review = False
    db.commit()
    db.refresh(email)
    log_audit(db, "zoho.email_ignored", "imported_email", email.id, email.subject or "", principal.user_id)
    return _email_list_response(email)


@router.post("/emails/{email_id}/archive", response_model=ImportedEmailResponse)
async def archive_imported_email(
    email_id: int,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    email = _get_owned_email(db, principal, email_id)
    email.import_status = "archived"
    email.needs_review = False
    db.commit()
    db.refresh(email)
    log_audit(db, "zoho.email_archived", "imported_email", email.id, email.subject or "", principal.user_id)
    return _email_list_response(email)
