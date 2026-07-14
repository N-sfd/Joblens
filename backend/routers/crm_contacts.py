"""Unified Contacts module API — reuses CRMContact, no parallel Recruiter model.

Mounted at `/api/crm/contacts` and aliased at `/api/contacts`.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, exists, func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CRMActivity,
    CRMActivityResponse,
    CRMContact,
    CRMContactCreate,
    CRMContactListItem,
    CRMContactListResponse,
    CRMContactResponse,
    CRMContactUpdate,
    CRMOrganization,
    ContactDuplicateCheckResponse,
    ContactDuplicateMatch,
    ContactStatusUpdate,
    JobRequirement,
    JobRequirementResponse,
    MarkContactedBody,
    Submission,
    SubmissionResponse,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from services.audit import log_audit
from services.crm_normalize import (
    contact_display_name,
    normalize_contact_status,
    normalize_contact_type,
    normalize_email,
    normalize_phone,
    normalize_source_label,
    raw_contact_statuses_matching_display,
    raw_contact_types_matching_display,
)
from services.job_status import normalize_job_status, raw_statuses_matching_group as job_raw_statuses_matching_group
from services.pipeline_status import (
    normalize_pipeline_stage,
    raw_statuses_matching_group as pipeline_raw_statuses_matching_group,
    stage_order,
)

router = APIRouter()

ORG_WIDE_ROLES = ("admin", "manager", "read_only")

CONTACT_METHOD_ACTIVITY = {
    "email": "Email Sent",
    "phone": "Phone Call",
    "call": "Phone Call",
    "sms": "SMS",
    "text": "SMS",
    "linkedin": "LinkedIn Message",
    "meeting": "Meeting",
    "other": "Note",
}


def _scope_owner(principal: AtsPrincipal) -> str | None:
    if principal.role in ORG_WIDE_ROLES:
        return None
    return principal.user_id


def _can_access(db: Session, contact: CRMContact, principal: AtsPrincipal) -> bool:
    owner = _scope_owner(principal)
    if owner is None:
        return True
    if contact.created_by == owner:
        return True
    linked = (
        db.query(JobRequirement.id)
        .filter(
            JobRequirement.created_by == owner,
            JobRequirement.recruiter_contact_id == contact.id,
        )
        .first()
    )
    return linked is not None


def _get_contact_or_404(db: Session, contact_id: int, principal: AtsPrincipal) -> CRMContact:
    contact = db.query(CRMContact).filter(CRMContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")
    if not _can_access(db, contact, principal):
        raise HTTPException(status_code=403, detail="You do not have access to this contact.")
    return contact


def _open_job_status_filter():
    known, includes_unmapped = job_raw_statuses_matching_group("open")
    from services.job_status import _STATUS_DISPLAY_MAP
    all_known = set(_STATUS_DISPLAY_MAP.keys())
    if includes_unmapped:
        return or_(
            JobRequirement.status.in_(list(known)),
            ~JobRequirement.status.in_(list(all_known)),
            JobRequirement.status.is_(None),
        )
    return JobRequirement.status.in_(list(known))


def _active_pipeline_status_filter():
    known, includes_unmapped = pipeline_raw_statuses_matching_group("active")
    from services.pipeline_status import _STATUS_DISPLAY_MAP
    all_known = set(_STATUS_DISPLAY_MAP.keys())
    if includes_unmapped:
        return or_(
            Submission.status.in_(list(known)),
            ~Submission.status.in_(list(all_known)),
            Submission.status.is_(None),
        )
    return Submission.status.in_(list(known))


def _related_for_contacts(db: Session, contact_ids: list[int]) -> dict[int, dict]:
    empty = {
        "open_job_count": 0,
        "active_pipeline_count": 0,
        "next_follow_up_at": None,
        "follow_up_overdue": False,
        "last_activity_at": None,
        "organization_name": None,
    }
    if not contact_ids:
        return {}

    now = datetime.utcnow()
    open_filter = _open_job_status_filter()
    open_jobs = dict(
        db.query(JobRequirement.recruiter_contact_id, func.count(JobRequirement.id))
        .filter(
            JobRequirement.recruiter_contact_id.in_(contact_ids),
            open_filter,
        )
        .group_by(JobRequirement.recruiter_contact_id)
        .all()
    )

    # Pipeline via direct recruiter_contact_id OR jobs owned by this contact
    active_filter = _active_pipeline_status_filter()
    pipeline_counts: dict[int, int] = {cid: 0 for cid in contact_ids}
    direct = dict(
        db.query(Submission.recruiter_contact_id, func.count(Submission.id))
        .filter(Submission.recruiter_contact_id.in_(contact_ids), active_filter)
        .group_by(Submission.recruiter_contact_id)
        .all()
    )
    for cid, cnt in direct.items():
        pipeline_counts[cid] = int(cnt)

    via_jobs = (
        db.query(JobRequirement.recruiter_contact_id, func.count(Submission.id))
        .join(Submission, Submission.job_requirement_id == JobRequirement.id)
        .filter(
            JobRequirement.recruiter_contact_id.in_(contact_ids),
            active_filter,
            or_(
                Submission.recruiter_contact_id.is_(None),
                ~Submission.recruiter_contact_id.in_(contact_ids),
            ),
        )
        .group_by(JobRequirement.recruiter_contact_id)
        .all()
    )
    for cid, cnt in via_jobs:
        pipeline_counts[cid] = pipeline_counts.get(cid, 0) + int(cnt)

    follow_rows = (
        db.query(CRMActivity)
        .filter(
            CRMActivity.contact_id.in_(contact_ids),
            CRMActivity.due_date.isnot(None),
            or_(CRMActivity.status == "Open", CRMActivity.status.is_(None)),
        )
        .order_by(CRMActivity.due_date.asc())
        .all()
    )
    next_fu: dict[int, datetime] = {}
    for row in follow_rows:
        if row.contact_id not in next_fu and row.due_date:
            next_fu[row.contact_id] = row.due_date

    activity_max = dict(
        db.query(CRMActivity.contact_id, func.max(CRMActivity.activity_date))
        .filter(CRMActivity.contact_id.in_(contact_ids))
        .group_by(CRMActivity.contact_id)
        .all()
    )
    contacted = {
        c.id: c.last_contacted_at
        for c in db.query(CRMContact.id, CRMContact.last_contacted_at)
        .filter(CRMContact.id.in_(contact_ids))
        .all()
    }
    updated = {
        c.id: c.updated_at
        for c in db.query(CRMContact.id, CRMContact.updated_at)
        .filter(CRMContact.id.in_(contact_ids))
        .all()
    }
    org_ids = {
        c.id: c.organization_id
        for c in db.query(CRMContact.id, CRMContact.organization_id)
        .filter(CRMContact.id.in_(contact_ids))
        .all()
    }
    org_names: dict[int, str] = {}
    oid_set = {oid for oid in org_ids.values() if oid}
    if oid_set:
        org_names = {
            o.id: o.organization_name
            for o in db.query(CRMOrganization.id, CRMOrganization.organization_name)
            .filter(CRMOrganization.id.in_(list(oid_set)))
            .all()
        }

    out: dict[int, dict] = {}
    for cid in contact_ids:
        fu = next_fu.get(cid)
        last_candidates = [d for d in (activity_max.get(cid), contacted.get(cid), updated.get(cid)) if d]
        last = max(last_candidates) if last_candidates else None
        oid = org_ids.get(cid)
        out[cid] = {
            "open_job_count": int(open_jobs.get(cid, 0)),
            "active_pipeline_count": int(pipeline_counts.get(cid, 0)),
            "next_follow_up_at": fu,
            "follow_up_overdue": bool(fu and fu < now),
            "last_activity_at": last,
            "organization_name": org_names.get(oid) if oid else None,
        }
    return out


def _enrich(contact: CRMContact, related: dict | None = None) -> CRMContactResponse:
    related = related or {}
    data = CRMContactResponse.model_validate(contact).model_dump()
    data["contact_type_display"] = normalize_contact_type(contact.contact_type)
    data["status_display"] = normalize_contact_status(contact.status)
    data["source_display"] = normalize_source_label(contact.source)
    data["display_name"] = contact_display_name(contact.first_name, contact.last_name, contact.email)
    data["organization_name"] = related.get("organization_name") or data.get("organization_name")
    data["open_job_count"] = int(related.get("open_job_count") or 0)
    data["active_pipeline_count"] = int(related.get("active_pipeline_count") or 0)
    data["next_follow_up_at"] = related.get("next_follow_up_at")
    data["follow_up_overdue"] = bool(related.get("follow_up_overdue"))
    data["last_activity_at"] = related.get("last_activity_at") or contact.updated_at
    return CRMContactResponse(**data)


def _to_list_item(contact: CRMContact, related: dict | None = None) -> CRMContactListItem:
    resp = _enrich(contact, related)
    dumped = resp.model_dump(exclude={"notes"})
    return CRMContactListItem(**dumped)


def find_contact_duplicates(
    db: Session,
    *,
    email: str | None = None,
    phone: str | None = None,
    exclude_id: int | None = None,
) -> list[ContactDuplicateMatch]:
    matches: list[ContactDuplicateMatch] = []
    seen: set[int] = set()

    def _add(row: CRMContact, reason: str):
        if exclude_id and row.id == exclude_id:
            return
        if row.id in seen:
            return
        seen.add(row.id)
        matches.append(ContactDuplicateMatch(
            id=row.id,
            display_name=contact_display_name(row.first_name, row.last_name, row.email),
            email=row.email,
            phone=row.phone or row.mobile,
            contact_type=row.contact_type,
            contact_type_display=normalize_contact_type(row.contact_type),
            status=row.status,
            status_display=normalize_contact_status(row.status),
            organization_id=row.organization_id,
            match_reason=reason,
        ))

    em = normalize_email(email)
    if em:
        for row in db.query(CRMContact).filter(CRMContact.normalized_email == em).limit(10).all():
            _add(row, "email")

    ph = normalize_phone(phone)
    if ph and len(ph) >= 7:
        candidates = db.query(CRMContact).filter(
            or_(CRMContact.phone.isnot(None), CRMContact.mobile.isnot(None))
        ).limit(500).all()
        for row in candidates:
            if normalize_phone(row.phone) == ph or normalize_phone(row.mobile) == ph:
                _add(row, "phone")

    return matches


@router.post("/check-duplicates", response_model=ContactDuplicateCheckResponse)
async def check_duplicates(
    body: dict,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    matches = find_contact_duplicates(
        db,
        email=body.get("email"),
        phone=body.get("phone") or body.get("mobile"),
        exclude_id=body.get("exclude_id"),
    )
    blocked = any(m.match_reason in ("email", "phone") for m in matches)
    return ContactDuplicateCheckResponse(matches=matches, blocked=blocked)


@router.post("/", response_model=CRMContactResponse, status_code=201)
async def create_contact(
    body: CRMContactCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
    force_new: bool = Query(False, description="Admin-only: continue as new despite email/phone duplicate"),
):
    matches = find_contact_duplicates(db, email=body.email, phone=body.phone or body.mobile)
    hard = [m for m in matches if m.match_reason in ("email", "phone")]
    if hard and not (force_new and principal.role == "admin"):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "A possible existing contact was found.",
                "matches": [m.model_dump() for m in hard],
            },
        )
    data = body.model_dump()
    normalized = normalize_email(data.get("email")) or None
    if principal.user_id:
        data["created_by"] = principal.user_id
    contact = CRMContact(**data, normalized_email=normalized)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    log_audit(
        db, "contact.created", "contact", contact.id,
        f"Created contact {contact_display_name(contact.first_name, contact.last_name, contact.email)}",
        principal.user_id,
    )
    related = _related_for_contacts(db, [contact.id]).get(contact.id, {})
    return _enrich(contact, related)


@router.get("/", response_model=CRMContactListResponse)
async def list_contacts(
    q: str | None = Query(None, description="Search name, email, phone, title, company"),
    organization_id: int | None = Query(None),
    contact_type: str | None = Query(None),
    status: str | None = Query(None),
    source: str | None = Query(None),
    has_open_jobs: bool | None = Query(None),
    has_pipeline: bool | None = Query(None),
    overdue_follow_up: bool | None = Query(None),
    needs_review: bool | None = Query(None),
    sort: str | None = Query("last_activity", description="last_activity|newest|name|updated"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    query = db.query(CRMContact)
    owner = _scope_owner(principal)
    if owner:
        subq = (
            db.query(JobRequirement.recruiter_contact_id)
            .filter(
                JobRequirement.created_by == owner,
                JobRequirement.recruiter_contact_id.isnot(None),
            )
            .distinct()
        )
        query = query.filter(or_(CRMContact.created_by == owner, CRMContact.id.in_(subq)))

    if organization_id is not None:
        query = query.filter(CRMContact.organization_id == organization_id)
    if contact_type:
        raws = raw_contact_types_matching_display(contact_type)
        query = query.filter(CRMContact.contact_type.in_(list(raws)))
    if status:
        raws = raw_contact_statuses_matching_display(status)
        query = query.filter(CRMContact.status.in_(list(raws)))
    if source:
        query = query.filter(CRMContact.source.ilike(f"%{source.strip()}%"))
    if needs_review is not None:
        query = query.filter(CRMContact.needs_review == needs_review)
    if q:
        term = f"%{q.strip()}%"
        org_ids = [
            oid for (oid,) in db.query(CRMOrganization.id)
            .filter(CRMOrganization.organization_name.ilike(term))
            .all()
        ]
        name_clauses = [
            CRMContact.first_name.ilike(term),
            CRMContact.last_name.ilike(term),
            CRMContact.email.ilike(term),
            CRMContact.phone.ilike(term),
            CRMContact.mobile.ilike(term),
            CRMContact.job_title.ilike(term),
        ]
        if org_ids:
            name_clauses.append(CRMContact.organization_id.in_(org_ids))
        query = query.filter(or_(*name_clauses))

    open_filter = _open_job_status_filter()
    if has_open_jobs is True:
        query = query.filter(exists().where(and_(
            JobRequirement.recruiter_contact_id == CRMContact.id,
            open_filter,
        )))
    elif has_open_jobs is False:
        query = query.filter(~exists().where(and_(
            JobRequirement.recruiter_contact_id == CRMContact.id,
            open_filter,
        )))

    active_filter = _active_pipeline_status_filter()
    pipeline_via_contact = exists().where(and_(
        Submission.recruiter_contact_id == CRMContact.id,
        active_filter,
    ))
    pipeline_via_job = exists().where(and_(
        JobRequirement.recruiter_contact_id == CRMContact.id,
        Submission.job_requirement_id == JobRequirement.id,
        active_filter,
    ))
    if has_pipeline is True:
        query = query.filter(or_(pipeline_via_contact, pipeline_via_job))
    elif has_pipeline is False:
        query = query.filter(~pipeline_via_contact, ~pipeline_via_job)

    now = datetime.utcnow()
    overdue_exists = exists().where(and_(
        CRMActivity.contact_id == CRMContact.id,
        CRMActivity.due_date.isnot(None),
        CRMActivity.due_date < now,
        or_(CRMActivity.status == "Open", CRMActivity.status.is_(None)),
    ))
    if overdue_follow_up is True:
        query = query.filter(overdue_exists)
    elif overdue_follow_up is False:
        query = query.filter(~overdue_exists)

    total = query.count()

    sort_key = (sort or "last_activity").lower()
    if sort_key in ("name", "display_name"):
        query = query.order_by(CRMContact.last_name.asc(), CRMContact.first_name.asc())
    elif sort_key == "newest":
        query = query.order_by(CRMContact.created_at.desc())
    else:
        query = query.order_by(
            func.coalesce(CRMContact.last_contacted_at, CRMContact.updated_at).desc(),
            CRMContact.updated_at.desc(),
        )

    offset = (page - 1) * page_size
    contacts = query.offset(offset).limit(page_size).all()

    related = _related_for_contacts(db, [c.id for c in contacts])
    if sort_key in ("last_activity", "updated", ""):
        contacts = sorted(
            contacts,
            key=lambda c: related.get(c.id, {}).get("last_activity_at") or c.updated_at or datetime.min,
            reverse=True,
        )

    items = [_to_list_item(c, related.get(c.id, {})) for c in contacts]
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 0
    return CRMContactListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{contact_id}", response_model=CRMContactResponse)
async def get_contact(
    contact_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    contact = _get_contact_or_404(db, contact_id, principal)
    related = _related_for_contacts(db, [contact.id]).get(contact.id, {})
    return _enrich(contact, related)


@router.put("/{contact_id}", response_model=CRMContactResponse)
async def update_contact(
    contact_id: int,
    body: CRMContactUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    contact = _get_contact_or_404(db, contact_id, principal)
    data = body.model_dump(exclude_unset=True)
    if "email" in data:
        normalized = normalize_email(data.get("email")) or None
        if normalized and normalized != contact.normalized_email:
            clash = find_contact_duplicates(db, email=normalized, exclude_id=contact_id)
            hard = [m for m in clash if m.match_reason == "email"]
            if hard:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "A possible existing contact was found.",
                        "matches": [m.model_dump() for m in hard],
                    },
                )
        contact.normalized_email = normalized
    for key, value in data.items():
        setattr(contact, key, value)
    db.commit()
    db.refresh(contact)
    log_audit(db, "contact.updated", "contact", contact.id, "Updated contact", principal.user_id)
    related = _related_for_contacts(db, [contact.id]).get(contact.id, {})
    return _enrich(contact, related)


@router.patch("/{contact_id}/status", response_model=CRMContactResponse)
async def update_contact_status(
    contact_id: int,
    body: ContactStatusUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    contact = _get_contact_or_404(db, contact_id, principal)
    contact.status = body.status
    db.commit()
    db.refresh(contact)
    log_audit(db, "contact.status", "contact", contact.id, f"Status → {body.status}", principal.user_id)
    related = _related_for_contacts(db, [contact.id]).get(contact.id, {})
    return _enrich(contact, related)


@router.post("/{contact_id}/mark-contacted", response_model=CRMContactResponse)
async def mark_contacted(
    contact_id: int,
    body: MarkContactedBody,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    contact = _get_contact_or_404(db, contact_id, principal)
    contacted_at = body.contacted_at or datetime.utcnow()
    method_key = (body.method or "other").strip().lower()
    activity_type = CONTACT_METHOD_ACTIVITY.get(method_key, "Note")
    subject = body.subject or f"{activity_type}"
    description = body.notes

    minute_start = contacted_at.replace(second=0, microsecond=0)
    minute_end = minute_start + timedelta(minutes=1)
    dup = (
        db.query(CRMActivity)
        .filter(
            CRMActivity.contact_id == contact_id,
            CRMActivity.activity_type == activity_type,
            CRMActivity.subject == subject,
            CRMActivity.activity_date >= minute_start,
            CRMActivity.activity_date < minute_end,
        )
        .first()
    )
    if not dup:
        db.add(CRMActivity(
            activity_type=activity_type,
            subject=subject,
            description=description,
            contact_id=contact.id,
            organization_id=contact.organization_id,
            activity_date=contacted_at,
            status="Completed",
            created_by=principal.user_id,
        ))

    if body.complete_follow_up_id:
        fu = (
            db.query(CRMActivity)
            .filter(
                CRMActivity.id == body.complete_follow_up_id,
                CRMActivity.contact_id == contact_id,
            )
            .first()
        )
        if fu:
            fu.status = "Completed"

    contact.last_contacted_at = contacted_at
    db.commit()
    db.refresh(contact)
    log_audit(db, "contact.marked_contacted", "contact", contact.id, activity_type, principal.user_id)
    related = _related_for_contacts(db, [contact.id]).get(contact.id, {})
    return _enrich(contact, related)


@router.get("/{contact_id}/jobs", response_model=list[JobRequirementResponse])
async def contact_jobs(
    contact_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_contact_or_404(db, contact_id, principal)
    jobs = (
        db.query(JobRequirement)
        .filter(JobRequirement.recruiter_contact_id == contact_id)
        .order_by(JobRequirement.updated_at.desc())
        .all()
    )
    out = []
    for job in jobs:
        data = JobRequirementResponse.model_validate(job).model_dump()
        data["status_display"] = normalize_job_status(job.status)
        out.append(JobRequirementResponse(**data))
    return out


@router.get("/{contact_id}/pipeline", response_model=list[SubmissionResponse])
async def contact_pipeline(
    contact_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_contact_or_404(db, contact_id, principal)
    job_ids = [
        r[0]
        for r in db.query(JobRequirement.id)
        .filter(JobRequirement.recruiter_contact_id == contact_id)
        .all()
    ]
    clauses = [Submission.recruiter_contact_id == contact_id]
    if job_ids:
        clauses.append(Submission.job_requirement_id.in_(job_ids))
    rows = (
        db.query(Submission)
        .filter(or_(*clauses))
        .order_by(Submission.updated_at.desc())
        .all()
    )
    out = []
    for sub in rows:
        data = SubmissionResponse.model_validate(sub).model_dump()
        display = normalize_pipeline_stage(sub.status)
        data["status_display"] = display
        data["stage_order"] = stage_order(display)
        out.append(SubmissionResponse(**data))
    return out


@router.get("/{contact_id}/activities", response_model=list[CRMActivityResponse])
async def contact_activities(
    contact_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_contact_or_404(db, contact_id, principal)
    return (
        db.query(CRMActivity)
        .filter(CRMActivity.contact_id == contact_id)
        .order_by(CRMActivity.activity_date.desc(), CRMActivity.created_at.desc())
        .all()
    )


@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: int,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
    confirm: bool = Query(False, description="Required for hard delete when no history"),
):
    contact = _get_contact_or_404(db, contact_id, principal)
    job_count = (
        db.query(func.count(JobRequirement.id))
        .filter(JobRequirement.recruiter_contact_id == contact_id)
        .scalar() or 0
    )
    activity_count = (
        db.query(func.count(CRMActivity.id))
        .filter(CRMActivity.contact_id == contact_id)
        .scalar() or 0
    )
    pipeline_count = (
        db.query(func.count(Submission.id))
        .filter(Submission.recruiter_contact_id == contact_id)
        .scalar() or 0
    )
    has_history = bool(job_count or activity_count or pipeline_count)

    if has_history:
        contact.status = "Archived"
        db.commit()
        log_audit(db, "contact.archived", "contact", contact_id, "Archived (history present)", principal.user_id)
        return {
            "message": "Contact has jobs, activities, or pipeline history — status set to Archived.",
            "archived": True,
            "id": contact_id,
        }

    if not confirm:
        contact.status = "Archived"
        db.commit()
        log_audit(db, "contact.archived", "contact", contact_id, "Archived (confirm not set)", principal.user_id)
        return {
            "message": "Contact archived. Pass confirm=true to hard-delete contacts with no history.",
            "archived": True,
            "id": contact_id,
        }

    db.delete(contact)
    db.commit()
    log_audit(db, "contact.deleted", "contact", contact_id, "Deleted contact", principal.user_id)
    return {"message": "Contact deleted.", "deleted": True, "id": contact_id}
