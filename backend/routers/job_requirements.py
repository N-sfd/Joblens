import json
import logging
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from database import get_db
from models import (
    CRMActivity,
    CRMContact,
    CRMOrganization,
    Employee,
    EmployeeResume,
    Interview,
    JobEmployeeSend,
    JobRequirement,
    JobRequirementCreate,
    JobRequirementUpdate,
    JobRequirementResponse,
    JobRequirementListResponse,
    JobRequirementParseRequest,
    JobRequirementParseResponse,
    JobCandidateItem,
    JobEmployeeMatchResult,
    JobStatusUpdate,
    Offer,
    Submission,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from services.audit import log_audit
from services.claude_service import parse_job_requirement
from services.job_employee_match import match_employees_to_job
from services.job_publish import publish_blockers, log_publish_decision
from services.job_status import (
    JOB_STATUS_GROUPS,
    is_zoho_source,
    matches_status_group,
    normalize_job_status,
    normalize_source_label,
    raw_statuses_matching_group,
)
from services.job_status import _ALL_KNOWN_RAW_STATUSES
from services.rate_limit import rate_limit_ai
from services.ai_errors import raise_clean_ai_error

router = APIRouter()

ORG_WIDE_ROLES = ("admin", "manager", "read_only")
SORT_OPTIONS = {
    "newest_received": ("received_at", "desc"),
    "recently_updated": ("updated_at", "desc"),
    "job_title": ("job_title", "asc"),
    "client": ("client", "asc"),
    "status": ("status", "asc"),
    "candidate_count": ("candidate_count", "desc"),
    "submission_count": ("submission_count", "desc"),
    "last_activity": ("last_activity", "desc"),
}


def _scope_owner(principal: AtsPrincipal) -> str | None:
    """None = organization-wide; a Clerk user id = restrict to their own records."""
    if principal.role in ORG_WIDE_ROLES:
        return None
    return principal.user_id


def _domain_from_email(email: str | None) -> str | None:
    if not email or "@" not in email:
        return None
    domain = email.strip().lower().split("@")[-1].strip()
    return domain or None


def _snapshot_for_publish(job: JobRequirement | None = None, data: dict | None = None) -> dict:
    base = {}
    if job is not None:
        base = {
            "review_status": job.review_status,
            "status": job.status,
            "job_description": job.job_description,
            "recruiter_name": job.recruiter_name,
            "recruiter_email": job.recruiter_email,
            "published_for_matching": bool(job.published_for_matching),
            "source": job.source,
        }
    if data:
        base.update({k: v for k, v in data.items() if v is not None or k in data})
    return base


def _enforce_publish_rules(snapshot: dict, *, job_id: int | None = None) -> None:
    if not snapshot.get("published_for_matching"):
        return
    blockers = publish_blockers(snapshot)
    if blockers:
        log_publish_decision(
            job_id=job_id or 0,
            review_status=snapshot.get("review_status"),
            status=snapshot.get("status"),
            published=True,
            source=snapshot.get("source"),
            included=False,
            reason="; ".join(blockers),
        )
        raise HTTPException(status_code=422, detail=" ".join(blockers))
    log_publish_decision(
        job_id=job_id or 0,
        review_status=snapshot.get("review_status"),
        status=snapshot.get("status"),
        published=True,
        source=snapshot.get("source"),
        included=True,
    )


def _loads(value) -> list:
    if not value:
        return []
    try:
        data = json.loads(value)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


class _JobCounts:
    __slots__ = ("candidate_count", "submission_count", "interview_count", "offer_count", "placement_count", "last_activity_at")

    def __init__(self, candidate_count=0, submission_count=0, interview_count=0, offer_count=0, placement_count=0, last_activity_at=None):
        self.candidate_count = candidate_count
        self.submission_count = submission_count
        self.interview_count = interview_count
        self.offer_count = offer_count
        self.placement_count = placement_count
        self.last_activity_at = last_activity_at


_EMPTY_COUNTS = _JobCounts()


def _to_response(job: JobRequirement, counts: "_JobCounts | None" = None) -> JobRequirementResponse:
    c = counts or _EMPTY_COUNTS
    return JobRequirementResponse(
        id=job.id,
        status_display=normalize_job_status(job.status),
        source_label=normalize_source_label(job.source),
        recruiter_link_status="linked" if job.recruiter_contact_id else "incomplete",
        candidate_count=c.candidate_count,
        submission_count=c.submission_count,
        interview_count=c.interview_count,
        offer_count=c.offer_count,
        placement_count=c.placement_count,
        last_activity_at=c.last_activity_at,
        job_title=job.job_title,
        external_job_id=job.external_job_id,
        job_reference_number=job.job_reference_number,
        vendor=job.vendor,
        vendor_id=job.vendor_id,
        recruiter_name=job.recruiter_name,
        recruiter_email=job.recruiter_email,
        recruiter_phone=job.recruiter_phone,
        recruiter_contact_id=job.recruiter_contact_id,
        client=job.client,
        client_id=job.client_id,
        end_client=job.end_client,
        end_client_id=job.end_client_id,
        location=job.location,
        city=job.city,
        state=job.state,
        country=job.country,
        work_type=job.work_type,
        employment_type=job.employment_type,
        contract_type=job.contract_type,
        rate=job.rate,
        rate_min=job.rate_min,
        rate_max=job.rate_max,
        rate_currency=job.rate_currency,
        rate_type=job.rate_type,
        duration=job.duration,
        visa_requirement=job.visa_requirement,
        clearance_requirement=job.clearance_requirement,
        required_skills=_loads(job.required_skills),
        preferred_skills=_loads(job.preferred_skills),
        minimum_experience=job.minimum_experience,
        education_requirement=job.education_requirement,
        certification_requirement=job.certification_requirement,
        job_description=job.job_description,
        application_url=job.application_url,
        application_platform=getattr(job, "application_platform", None),
        raw_email_text=job.raw_email_text,
        submission_instructions=job.submission_instructions,
        submission_deadline=job.submission_deadline,
        number_of_openings=job.number_of_openings,
        status=job.status,
        priority=job.priority,
        source=job.source,
        notes=job.notes,
        published_for_matching=bool(job.published_for_matching),
        review_status=job.review_status or "Draft",
        vendor_name=job.vendor_org.organization_name if job.vendor_org else None,
        client_name=job.client_org.organization_name if job.client_org else None,
        end_client_name=job.end_client_org.organization_name if job.end_client_org else None,
        recruiter_contact_name=_contact_display(job.recruiter_contact) if job.recruiter_contact else None,
        created_by=job.created_by,
        received_at=job.received_at,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _contact_display(contact) -> str:
    name = " ".join(p for p in [contact.first_name, contact.last_name] if p).strip()
    return name or contact.email or f"Contact #{contact.id}"


def _batch_job_counts(db: Session, job_ids: list[int]) -> dict[int, _JobCounts]:
    """One bounded aggregate pass per metric across a page of job ids — never
    loads full child collections just to count them."""
    if not job_ids:
        return {}
    counts: dict[int, _JobCounts] = {jid: _JobCounts() for jid in job_ids}

    for jid, status, cnt in (
        db.query(Submission.job_requirement_id, Submission.status, func.count(Submission.id))
        .filter(Submission.job_requirement_id.in_(job_ids))
        .group_by(Submission.job_requirement_id, Submission.status)
        .all()
    ):
        counts[jid].submission_count += cnt
        if status == "Selected":
            counts[jid].placement_count += cnt

    candidate_sets: dict[int, set[int]] = {jid: set() for jid in job_ids}
    for jid, emp_id in (
        db.query(JobEmployeeSend.job_requirement_id, JobEmployeeSend.employee_id)
        .filter(JobEmployeeSend.job_requirement_id.in_(job_ids))
        .distinct()
        .all()
    ):
        candidate_sets[jid].add(emp_id)
    for jid, emp_id in (
        db.query(Submission.job_requirement_id, Submission.employee_id)
        .filter(Submission.job_requirement_id.in_(job_ids))
        .distinct()
        .all()
    ):
        candidate_sets[jid].add(emp_id)
    for jid, emp_set in candidate_sets.items():
        counts[jid].candidate_count = len(emp_set)

    for jid, cnt in (
        db.query(Submission.job_requirement_id, func.count(Interview.id))
        .join(Interview, Interview.submission_id == Submission.id)
        .filter(Submission.job_requirement_id.in_(job_ids))
        .group_by(Submission.job_requirement_id)
        .all()
    ):
        counts[jid].interview_count = cnt

    for jid, cnt in (
        db.query(Submission.job_requirement_id, func.count(Offer.id))
        .join(Offer, Offer.submission_id == Submission.id)
        .filter(Submission.job_requirement_id.in_(job_ids))
        .group_by(Submission.job_requirement_id)
        .all()
    ):
        counts[jid].offer_count = cnt

    for jid, max_date in (
        db.query(CRMActivity.job_requirement_id, func.max(CRMActivity.activity_date))
        .filter(CRMActivity.job_requirement_id.in_(job_ids))
        .group_by(CRMActivity.job_requirement_id)
        .all()
    ):
        counts[jid].last_activity_at = max_date

    return counts


def _get_job_or_404(db: Session, job_id: int) -> JobRequirement:
    job = db.query(JobRequirement).filter(JobRequirement.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job requirement not found.")
    return job


def _get_scoped_job_or_404(db: Session, principal: AtsPrincipal, job_id: int) -> JobRequirement:
    """404s (not 403) if the job exists but is out of a Recruiter's own scope
    — avoids confirming the existence of jobs they shouldn't know about."""
    job = _get_job_or_404(db, job_id)
    owner = _scope_owner(principal)
    if owner and job.created_by != owner:
        raise HTTPException(status_code=404, detail="Job requirement not found.")
    return job


def _prepare_create_data(data: dict) -> dict:
    data["required_skills"] = json.dumps(data.pop("required_skills") or [])
    data["preferred_skills"] = json.dumps(data.pop("preferred_skills") or [])
    data = _apply_url_classification(data)
    return data


def _prepare_update_data(data: dict) -> dict:
    if "required_skills" in data and data["required_skills"] is not None:
        data["required_skills"] = json.dumps(data["required_skills"])
    if "preferred_skills" in data and data["preferred_skills"] is not None:
        data["preferred_skills"] = json.dumps(data["preferred_skills"])
    if "application_url" in data or "application_platform" in data or "recruiter_email" in data:
        data = _apply_url_classification(data, partial=True)
    return data


def _apply_url_classification(data: dict, *, partial: bool = False) -> dict:
    """Normalize application_url and set application_platform (Phase 5 M0)."""
    from services.application_url import (
        normalize_application_url,
        classify_platform,
        PLATFORM_RECRUITER_EMAIL,
        PLATFORM_UNKNOWN,
    )

    url = data.get("application_url")
    email = data.get("recruiter_email")
    if url is not None or not partial:
        classified = normalize_application_url(url)
        if classified.is_valid and classified.normalized_url:
            data["application_url"] = classified.normalized_url
            data["application_platform"] = classified.platform
        elif url is not None and not str(url).strip():
            data["application_url"] = None
            if email and str(email).strip():
                data["application_platform"] = PLATFORM_RECRUITER_EMAIL
            else:
                data["application_platform"] = data.get("application_platform") or PLATFORM_UNKNOWN
        elif classified.error and url:
            # Keep original string but mark unknown/invalid for operators to fix
            data["application_platform"] = PLATFORM_UNKNOWN
        elif not url and email and str(email).strip():
            data["application_platform"] = PLATFORM_RECRUITER_EMAIL
    return data


def _find_org_by_name(db: Session, name: str) -> CRMOrganization | None:
    if not name or not name.strip():
        return None
    # Exact case-insensitive name only — no fuzzy/weak merges.
    return (
        db.query(CRMOrganization)
        .filter(CRMOrganization.organization_name.ilike(name.strip()))
        .first()
    )


def _find_org_by_domain(db: Session, email_domain: str | None) -> CRMOrganization | None:
    from services.crm_normalize import normalize_domain

    domain = normalize_domain(email_domain)
    if not domain:
        return None
    return (
        db.query(CRMOrganization)
        .filter(CRMOrganization.email_domain == domain)
        .first()
    )


def _find_contact(
    db: Session,
    email: str | None,
    name: str | None,
    *,
    phone: str | None = None,
    organization_id: int | None = None,
) -> CRMContact | None:
    """Match recruiter contacts: email → phone → name+company. No weak auto-merge."""
    from services.crm_normalize import normalize_email as _norm_email
    from services.crm_normalize import normalize_phone as _norm_phone

    if email and email.strip():
        contact = (
            db.query(CRMContact)
            .filter(CRMContact.normalized_email == _norm_email(email))
            .first()
        )
        if contact:
            return contact

    ph = _norm_phone(phone)
    if ph and len(ph) >= 7:
        for row in db.query(CRMContact).filter(
            (CRMContact.phone.isnot(None)) | (CRMContact.mobile.isnot(None))
        ).all():
            if _norm_phone(row.phone) == ph or _norm_phone(row.mobile) == ph:
                return row

    if name and name.strip():
        parts = name.strip().split()
        first = parts[0]
        last = parts[-1] if len(parts) > 1 else None
        q = db.query(CRMContact).filter(CRMContact.first_name.ilike(first))
        if last:
            q = q.filter(CRMContact.last_name.ilike(last))
        if organization_id is not None:
            q = q.filter(CRMContact.organization_id == organization_id)
        return q.first()
    return None


def _find_or_create_org(
    db: Session, *, name: str | None, email_domain: str | None, source: str, principal: AtsPrincipal,
) -> CRMOrganization | None:
    """Find org by domain then exact name; never fuzzy-merge aliases.

    Order: linked ID (caller) → normalized domain → normalized name → create.
    """
    from services.crm_normalize import normalize_domain

    domain = normalize_domain(email_domain)
    org = _find_org_by_domain(db, domain)
    if not org and name and name.strip():
        org = _find_org_by_name(db, name)
    if org:
        if domain and not org.email_domain:
            org.email_domain = domain
        return org
    if not name or not name.strip():
        return None
    org = CRMOrganization(
        organization_name=name.strip(),
        organization_type="Staffing Vendor",
        email_domain=domain or None,
        source=source,
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
    source: str,
    principal: AtsPrincipal,
) -> CRMContact | None:
    """Find a CRM contact by email/phone/name+company, else create one."""
    if not (email and email.strip()) and not (name and name.strip()) and not (phone and str(phone).strip()):
        return None
    contact = _find_contact(db, email, name, phone=phone, organization_id=organization_id)
    if contact:
        if phone and not contact.phone:
            contact.phone = phone
        if organization_id and not contact.organization_id:
            contact.organization_id = organization_id
        return contact
    parts = (name or "").strip().split()
    first_name = parts[0] if parts else None
    last_name = " ".join(parts[1:]) if len(parts) > 1 else None
    from services.crm_normalize import normalize_email as _norm_email

    contact = CRMContact(
        organization_id=organization_id,
        first_name=first_name,
        last_name=last_name,
        email=email,
        normalized_email=_norm_email(email) or None,
        phone=phone,
        contact_type="Recruiter",
        source=source,
        needs_review=True,
        created_by=principal.user_id,
    )
    db.add(contact)
    db.flush()
    return contact


def _auto_link_crm(
    db: Session, data: dict, *, principal: AtsPrincipal, create_missing: bool = False,
) -> dict:
    """Resolve CRM FK ids from provided names/emails when an id isn't set.

    Only fills a link when it's currently empty, so an explicit selection from
    the UI is never overridden.

    Company match order: existing ID → domain → exact name (no weak merge).
    Contact match order: email → phone → name+company.

    When `create_missing=True` (job save flows), a recruiter/company with no
    existing match is created rather than left unlinked. Client/end client
    are only ever linked, never auto-created.
    """
    link_source = data.get("source") or "Manual"
    domain = _domain_from_email(data.get("recruiter_email"))

    if data.get("vendor_id") is None:
        org = None
        if domain:
            org = _find_org_by_domain(db, domain)
        if not org and data.get("vendor"):
            org = _find_org_by_name(db, data["vendor"])
        if not org and create_missing and data.get("vendor"):
            org = _find_or_create_org(
                db,
                name=data["vendor"],
                email_domain=domain,
                source=link_source,
                principal=principal,
            )
        if org:
            data["vendor_id"] = org.id
    if data.get("client_id") is None and data.get("client"):
        org = _find_org_by_name(db, data["client"])
        if org:
            data["client_id"] = org.id
    if data.get("end_client_id") is None and data.get("end_client"):
        org = _find_org_by_name(db, data["end_client"])
        if org:
            data["end_client_id"] = org.id
    if data.get("recruiter_contact_id") is None and (
        data.get("recruiter_email") or data.get("recruiter_name") or data.get("recruiter_phone")
    ):
        contact = _find_contact(
            db,
            data.get("recruiter_email"),
            data.get("recruiter_name"),
            phone=data.get("recruiter_phone"),
            organization_id=data.get("vendor_id"),
        )
        if not contact and create_missing:
            contact = _find_or_create_contact(
                db,
                email=data.get("recruiter_email"),
                name=data.get("recruiter_name"),
                phone=data.get("recruiter_phone"),
                organization_id=data.get("vendor_id"),
                source=link_source,
                principal=principal,
            )
        if contact:
            data["recruiter_contact_id"] = contact.id
    return data


@router.post("/parse", response_model=JobRequirementParseResponse)
async def parse_job_requirement_text(
    body: JobRequirementParseRequest,
    request: Request,
    principal: AtsPrincipal = Depends(require_writer),
):
    rate_limit_ai(request, principal.user_id)
    if len(body.raw_text.strip()) < 20:
        raise HTTPException(status_code=422, detail="Paste more of the job email/description to parse.")
    try:
        parsed = await parse_job_requirement(body.raw_text)
    except Exception as e:
        raise_clean_ai_error(logger, "Job details parsing", e)
    return JobRequirementParseResponse(**{k: v for k, v in parsed.items() if k != "rate"})


@router.post("/", response_model=JobRequirementResponse, status_code=201)
async def create_job_requirement(
    body: JobRequirementCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    data = _prepare_create_data(body.model_dump())
    data = _auto_link_crm(db, data, principal=principal, create_missing=True)
    if principal.user_id:
        data["created_by"] = principal.user_id
    _enforce_publish_rules(data)
    job = JobRequirement(**data)
    db.add(job)
    db.commit()
    db.refresh(job)
    log_audit(db, "job.created", "job_requirement", job.id, f"Created job {job.job_title}", principal.user_id)
    return _to_response(job)


@router.get("/", response_model=JobRequirementListResponse)
async def list_job_requirements(
    q: str | None = Query(None),
    status: str | None = Query(None),
    status_display: str | None = Query(None, description="Exact canonical status: Draft/Open/On Hold/Filled/Closed"),
    status_group: str | None = Query(None, description='"open" (Open+On Hold) or an exact canonical status'),
    work_type: str | None = Query(None),
    priority: str | None = Query(None),
    source: str | None = Query(None, description="Substring match, e.g. 'zoho' or 'manual' — not case sensitive"),
    created_within_days: int | None = Query(None, ge=1),
    vendor: str | None = Query(None),
    client: str | None = Query(None),
    recruiter: str | None = Query(None, description="Search recruiter name/email"),
    location: str | None = Query(None),
    skills: str | None = Query(None, description="Substring match within required/preferred skills"),
    received_from: datetime | None = Query(None),
    received_to: datetime | None = Query(None),
    created_by: str | None = Query(None),
    has_candidates: bool | None = Query(None),
    has_submissions: bool | None = Query(None),
    vendor_id: int | None = Query(None),
    client_id: int | None = Query(None),
    end_client_id: int | None = Query(None),
    recruiter_contact_id: int | None = Query(None),
    organization_id: int | None = Query(None, description="Match jobs where this org is vendor, client, or end client"),
    sort: str = Query("last_activity", description=f"One of: {', '.join(SORT_OPTIONS)}"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    query = db.query(JobRequirement)

    owner = _scope_owner(principal)
    if owner:
        query = query.filter(JobRequirement.created_by == owner)

    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(
            JobRequirement.job_title.ilike(term),
            JobRequirement.vendor.ilike(term),
            JobRequirement.client.ilike(term),
            JobRequirement.end_client.ilike(term),
            JobRequirement.location.ilike(term),
            JobRequirement.recruiter_name.ilike(term),
            JobRequirement.job_reference_number.ilike(term),
        ))
    if status:
        query = query.filter(JobRequirement.status == status)
    if status_display:
        known, includes_unmapped = raw_statuses_matching_group(status_display)
        query = query.filter(
            or_(JobRequirement.status.in_(known), ~JobRequirement.status.in_(_ALL_KNOWN_RAW_STATUSES))
            if includes_unmapped else JobRequirement.status.in_(known)
        )
    if status_group:
        known, includes_unmapped = raw_statuses_matching_group(status_group)
        query = query.filter(
            or_(JobRequirement.status.in_(known), ~JobRequirement.status.in_(_ALL_KNOWN_RAW_STATUSES))
            if includes_unmapped else JobRequirement.status.in_(known)
        )
    if work_type:
        query = query.filter(JobRequirement.work_type == work_type)
    if priority:
        query = query.filter(JobRequirement.priority == priority)
    if source:
        query = query.filter(JobRequirement.source.ilike(f"%{source.strip()}%"))
    if created_within_days:
        query = query.filter(JobRequirement.created_at >= datetime.utcnow() - timedelta(days=created_within_days))
    if vendor:
        query = query.filter(JobRequirement.vendor.ilike(f"%{vendor.strip()}%"))
    if client:
        query = query.filter(or_(
            JobRequirement.client.ilike(f"%{client.strip()}%"),
            JobRequirement.end_client.ilike(f"%{client.strip()}%"),
        ))
    if recruiter:
        term = f"%{recruiter.strip()}%"
        query = query.filter(or_(JobRequirement.recruiter_name.ilike(term), JobRequirement.recruiter_email.ilike(term)))
    if location:
        query = query.filter(JobRequirement.location.ilike(f"%{location.strip()}%"))
    if skills:
        term = f"%{skills.strip()}%"
        query = query.filter(or_(JobRequirement.required_skills.ilike(term), JobRequirement.preferred_skills.ilike(term)))
    if received_from:
        query = query.filter(JobRequirement.received_at >= received_from)
    if received_to:
        query = query.filter(JobRequirement.received_at <= received_to)
    if created_by:
        query = query.filter(JobRequirement.created_by == created_by)
    if vendor_id is not None:
        query = query.filter(JobRequirement.vendor_id == vendor_id)
    if client_id is not None:
        query = query.filter(JobRequirement.client_id == client_id)
    if end_client_id is not None:
        query = query.filter(JobRequirement.end_client_id == end_client_id)
    if recruiter_contact_id is not None:
        query = query.filter(JobRequirement.recruiter_contact_id == recruiter_contact_id)
    if organization_id is not None:
        query = query.filter(or_(
            JobRequirement.vendor_id == organization_id,
            JobRequirement.client_id == organization_id,
            JobRequirement.end_client_id == organization_id,
        ))
    if has_candidates is not None:
        candidate_exists = or_(
            db.query(JobEmployeeSend.id).filter(JobEmployeeSend.job_requirement_id == JobRequirement.id).exists(),
            db.query(Submission.id).filter(Submission.job_requirement_id == JobRequirement.id).exists(),
        )
        query = query.filter(candidate_exists if has_candidates else ~candidate_exists)
    if has_submissions is not None:
        submission_exists = db.query(Submission.id).filter(Submission.job_requirement_id == JobRequirement.id).exists()
        query = query.filter(submission_exists if has_submissions else ~submission_exists)

    total = query.count()
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1

    sort_key = sort if sort in SORT_OPTIONS else "last_activity"
    if sort_key == "job_title":
        query = query.order_by(JobRequirement.job_title.asc())
    elif sort_key == "client":
        query = query.order_by(JobRequirement.client.asc())
    elif sort_key == "status":
        query = query.order_by(JobRequirement.status.asc())
    elif sort_key == "newest_received":
        query = query.order_by(JobRequirement.received_at.desc())
    elif sort_key == "recently_updated":
        query = query.order_by(JobRequirement.updated_at.desc())
    elif sort_key == "submission_count":
        sub_count = (
            db.query(func.count(Submission.id))
            .filter(Submission.job_requirement_id == JobRequirement.id)
            .correlate(JobRequirement)
            .scalar_subquery()
        )
        query = query.order_by(sub_count.desc())
    elif sort_key == "candidate_count":
        # Approximates the exact display count (sends ∪ submissions) with
        # submission-linked candidates only, for tractable SQL-level sorting.
        cand_count = (
            db.query(func.count(func.distinct(Submission.employee_id)))
            .filter(Submission.job_requirement_id == JobRequirement.id)
            .correlate(JobRequirement)
            .scalar_subquery()
        )
        query = query.order_by(cand_count.desc())
    else:  # last_activity (default)
        last_activity = (
            db.query(func.max(CRMActivity.activity_date))
            .filter(CRMActivity.job_requirement_id == JobRequirement.id)
            .correlate(JobRequirement)
            .scalar_subquery()
        )
        query = query.order_by(func.coalesce(last_activity, JobRequirement.updated_at).desc())

    jobs = query.offset((page - 1) * page_size).limit(page_size).all()
    counts_by_id = _batch_job_counts(db, [j.id for j in jobs])
    return JobRequirementListResponse(
        items=[_to_response(j, counts_by_id.get(j.id)) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{job_id}", response_model=JobRequirementResponse)
async def get_job_requirement(
    job_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    job = _get_scoped_job_or_404(db, principal, job_id)
    counts = _batch_job_counts(db, [job.id]).get(job.id)
    return _to_response(job, counts)


@router.patch("/{job_id}/status", response_model=JobRequirementResponse)
async def update_job_status(
    job_id: int,
    body: JobStatusUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    if body.status not in JOB_STATUS_GROUPS:
        raise HTTPException(status_code=422, detail=f"Status must be one of: {', '.join(JOB_STATUS_GROUPS)}")
    job = _get_scoped_job_or_404(db, principal, job_id)
    previous = job.status
    job.status = body.status
    db.add(CRMActivity(
        activity_type="Status Changed",
        subject=f"Job status changed: {normalize_job_status(previous)} → {body.status}",
        job_requirement_id=job.id,
        created_by=principal.user_id,
    ))
    db.commit()
    db.refresh(job)
    log_audit(db, "job.status_changed", "job_requirement", job.id, f"{previous} -> {body.status}", principal.user_id)
    counts = _batch_job_counts(db, [job.id]).get(job.id)
    return _to_response(job, counts)


@router.get("/{job_id}/matches", response_model=list[JobEmployeeMatchResult])
async def get_job_employee_matches(
    job_id: int,
    min_score: int = Query(0, ge=0, le=100),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    job = _get_scoped_job_or_404(db, principal, job_id)
    employees = db.query(Employee).all()

    # Primary resume per employee (or most recent).
    resumes = (
        db.query(EmployeeResume)
        .filter(EmployeeResume.is_primary.is_(True))
        .all()
    )
    primary_map = {r.employee_id: r for r in resumes}
    for r in (
        db.query(EmployeeResume)
        .order_by(EmployeeResume.uploaded_at.desc())
        .all()
    ):
        primary_map.setdefault(r.employee_id, r)

    matches = match_employees_to_job(job, employees, primary_map)
    if min_score > 0:
        matches = [m for m in matches if m["match_score"] >= min_score]
    return [JobEmployeeMatchResult(**m) for m in matches]


def _employee_display_name(emp: Employee) -> str:
    return " ".join(p for p in [emp.first_name, emp.last_name] if p).strip() or emp.name


def _match_recommendation(score: int | None) -> str | None:
    if score is None:
        return None
    if score >= 75:
        return "Strong Match"
    if score >= 50:
        return "Possible Match"
    return "Weak Match"


@router.get("/{job_id}/candidates", response_model=list[JobCandidateItem])
async def get_job_candidates(
    job_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    """Candidates connected to this job via a match/send, a submission, or both."""
    _get_scoped_job_or_404(db, principal, job_id)

    sends = (
        db.query(JobEmployeeSend)
        .filter(JobEmployeeSend.job_requirement_id == job_id)
        .order_by(JobEmployeeSend.created_at.desc())
        .all()
    )
    submissions = (
        db.query(Submission)
        .filter(Submission.job_requirement_id == job_id)
        .order_by(Submission.created_at.desc())
        .all()
    )

    employee_ids = {s.employee_id for s in sends} | {s.employee_id for s in submissions}
    if not employee_ids:
        return []

    employees = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(employee_ids)).all()}
    best_send: dict[int, JobEmployeeSend] = {}
    for s in sends:
        current = best_send.get(s.employee_id)
        if current is None or (s.match_score_at_send or -1) > (current.match_score_at_send or -1):
            best_send[s.employee_id] = s
    latest_submission: dict[int, Submission] = {}
    for sub in submissions:
        latest_submission.setdefault(sub.employee_id, sub)  # already ordered newest-first

    items: list[JobCandidateItem] = []
    for emp_id in employee_ids:
        emp = employees.get(emp_id)
        if not emp:
            continue
        send = best_send.get(emp_id)
        sub = latest_submission.get(emp_id)
        linked_via = [v for v, present in (("match", send), ("submission", sub)) if present]
        skills = [emp.primary_skill] if emp.primary_skill else []
        try:
            skills.extend(json.loads(emp.secondary_skills) if emp.secondary_skills else [])
        except (json.JSONDecodeError, TypeError):
            pass
        score = send.match_score_at_send if send else None
        items.append(JobCandidateItem(
            employee_id=emp_id,
            employee_name=_employee_display_name(emp),
            current_title=emp.current_job_title,
            skills=skills,
            work_authorization=emp.work_authorization,
            match_score=score,
            match_recommendation=_match_recommendation(score),
            submission_id=sub.id if sub else None,
            submission_status=sub.status if sub else None,
            linked_via=linked_via,
        ))
    items.sort(key=lambda i: (i.match_score is None, -(i.match_score or 0)))
    return items


@router.put("/{job_id}", response_model=JobRequirementResponse)
async def update_job_requirement(
    job_id: int,
    body: JobRequirementUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    job = _get_scoped_job_or_404(db, principal, job_id)
    data = _prepare_update_data(body.model_dump(exclude_unset=True))
    for key, value in data.items():
        setattr(job, key, value)

    # Re-resolve CRM links from the job's current names/emails for any link
    # that is still empty (explicit ids set above are preserved). Creates a
    # missing recruiter/company the same way the initial save does.
    resolved = _auto_link_crm(
        db,
        {
            "vendor": job.vendor, "vendor_id": job.vendor_id,
            "client": job.client, "client_id": job.client_id,
            "end_client": job.end_client, "end_client_id": job.end_client_id,
            "recruiter_name": job.recruiter_name, "recruiter_email": job.recruiter_email,
            "recruiter_phone": job.recruiter_phone,
            "recruiter_contact_id": job.recruiter_contact_id,
            "source": job.source,
        },
        principal=principal,
        create_missing=True,
    )
    job.vendor_id = resolved.get("vendor_id")
    job.client_id = resolved.get("client_id")
    job.end_client_id = resolved.get("end_client_id")
    job.recruiter_contact_id = resolved.get("recruiter_contact_id")

    _enforce_publish_rules(_snapshot_for_publish(job), job_id=job.id)

    db.commit()
    db.refresh(job)
    log_audit(db, "job.updated", "job_requirement", job.id, f"Updated job {job.job_title}", principal.user_id)
    counts = _batch_job_counts(db, [job.id]).get(job.id)
    return _to_response(job, counts)


@router.delete("/{job_id}")
async def delete_job_requirement(
    job_id: int,
    confirm: bool = Query(False, description="Must be true to hard-delete — the caller's explicit confirmation"),
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    job = _get_job_or_404(db, job_id)

    has_dependents = (
        db.query(Submission.id).filter(Submission.job_requirement_id == job_id).first() is not None
        or db.query(JobEmployeeSend.id).filter(JobEmployeeSend.job_requirement_id == job_id).first() is not None
        or db.query(CRMActivity.id).filter(CRMActivity.job_requirement_id == job_id).first() is not None
    )
    if has_dependents:
        raise HTTPException(
            status_code=409,
            detail="This job has candidate matches, submissions, or activity — close it instead of deleting.",
        )
    if normalize_job_status(job.status) != "Draft":
        raise HTTPException(status_code=409, detail="Only Draft jobs can be permanently deleted — close it instead.")
    if not confirm:
        raise HTTPException(status_code=409, detail="Deletion requires explicit confirmation (confirm=true).")

    title = job.job_title
    db.delete(job)
    db.commit()
    log_audit(db, "job.deleted", "job_requirement", job_id, f"Deleted job {title}", principal.user_id)
    return {"message": "Job requirement deleted."}
