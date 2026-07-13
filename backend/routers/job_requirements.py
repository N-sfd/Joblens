import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from database import get_db
from models import (
    CRMContact,
    CRMOrganization,
    Employee,
    EmployeeResume,
    JobRequirement,
    JobRequirementCreate,
    JobRequirementUpdate,
    JobRequirementResponse,
    JobRequirementListResponse,
    JobRequirementParseRequest,
    JobRequirementParseResponse,
    JobEmployeeMatchResult,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from services.audit import log_audit
from services.claude_service import parse_job_requirement
from services.job_employee_match import match_employees_to_job
from services.rate_limit import rate_limit_ai

router = APIRouter()


def _loads(value) -> list:
    if not value:
        return []
    try:
        data = json.loads(value)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _to_response(job: JobRequirement) -> JobRequirementResponse:
    return JobRequirementResponse(
        id=job.id,
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
        raw_email_text=job.raw_email_text,
        submission_instructions=job.submission_instructions,
        submission_deadline=job.submission_deadline,
        number_of_openings=job.number_of_openings,
        status=job.status,
        priority=job.priority,
        source=job.source,
        notes=job.notes,
        published_for_matching=bool(job.published_for_matching),
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


def _get_job_or_404(db: Session, job_id: int) -> JobRequirement:
    job = db.query(JobRequirement).filter(JobRequirement.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job requirement not found.")
    return job


def _prepare_create_data(data: dict) -> dict:
    data["required_skills"] = json.dumps(data.pop("required_skills") or [])
    data["preferred_skills"] = json.dumps(data.pop("preferred_skills") or [])
    return data


def _prepare_update_data(data: dict) -> dict:
    if "required_skills" in data and data["required_skills"] is not None:
        data["required_skills"] = json.dumps(data["required_skills"])
    if "preferred_skills" in data and data["preferred_skills"] is not None:
        data["preferred_skills"] = json.dumps(data["preferred_skills"])
    return data


def _find_org_by_name(db: Session, name: str) -> CRMOrganization | None:
    if not name or not name.strip():
        return None
    return (
        db.query(CRMOrganization)
        .filter(CRMOrganization.organization_name.ilike(name.strip()))
        .first()
    )


def _find_contact(db: Session, email: str | None, name: str | None) -> CRMContact | None:
    if email and email.strip():
        contact = (
            db.query(CRMContact)
            .filter(CRMContact.normalized_email == email.strip().lower())
            .first()
        )
        if contact:
            return contact
    if name and name.strip():
        parts = name.strip().split()
        first = parts[0]
        last = parts[-1] if len(parts) > 1 else None
        q = db.query(CRMContact).filter(CRMContact.first_name.ilike(first))
        if last:
            q = q.filter(CRMContact.last_name.ilike(last))
        return q.first()
    return None


def _auto_link_crm(db: Session, data: dict) -> dict:
    """Resolve CRM FK ids from provided names/emails when an id isn't set.

    Only fills a link when it's currently empty, so an explicit selection from
    the UI is never overridden. Exact (case-insensitive) name match for orgs.
    """
    if data.get("vendor_id") is None and data.get("vendor"):
        org = _find_org_by_name(db, data["vendor"])
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
    if data.get("recruiter_contact_id") is None and (data.get("recruiter_email") or data.get("recruiter_name")):
        contact = _find_contact(db, data.get("recruiter_email"), data.get("recruiter_name"))
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
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")
    return JobRequirementParseResponse(**{k: v for k, v in parsed.items() if k != "rate"})


@router.post("/", response_model=JobRequirementResponse, status_code=201)
async def create_job_requirement(
    body: JobRequirementCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    data = _prepare_create_data(body.model_dump())
    data = _auto_link_crm(db, data)
    if principal.user_id:
        data["created_by"] = principal.user_id
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
    work_type: str | None = Query(None),
    priority: str | None = Query(None),
    source: str | None = Query(None),
    vendor: str | None = Query(None),
    client: str | None = Query(None),
    vendor_id: int | None = Query(None),
    client_id: int | None = Query(None),
    end_client_id: int | None = Query(None),
    recruiter_contact_id: int | None = Query(None),
    organization_id: int | None = Query(None, description="Match jobs where this org is vendor, client, or end client"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    query = db.query(JobRequirement)

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
    if work_type:
        query = query.filter(JobRequirement.work_type == work_type)
    if priority:
        query = query.filter(JobRequirement.priority == priority)
    if source:
        query = query.filter(JobRequirement.source == source)
    if vendor:
        query = query.filter(JobRequirement.vendor.ilike(f"%{vendor.strip()}%"))
    if client:
        query = query.filter(or_(
            JobRequirement.client.ilike(f"%{client.strip()}%"),
            JobRequirement.end_client.ilike(f"%{client.strip()}%"),
        ))
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

    total = query.count()
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    jobs = (
        query.order_by(JobRequirement.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return JobRequirementListResponse(
        items=[_to_response(j) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{job_id}", response_model=JobRequirementResponse)
async def get_job_requirement(
    job_id: int,
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    return _to_response(_get_job_or_404(db, job_id))


@router.get("/{job_id}/matches", response_model=list[JobEmployeeMatchResult])
async def get_job_employee_matches(
    job_id: int,
    min_score: int = Query(0, ge=0, le=100),
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    job = _get_job_or_404(db, job_id)
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


@router.put("/{job_id}", response_model=JobRequirementResponse)
async def update_job_requirement(
    job_id: int,
    body: JobRequirementUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    job = _get_job_or_404(db, job_id)
    data = _prepare_update_data(body.model_dump(exclude_unset=True))
    for key, value in data.items():
        setattr(job, key, value)

    # Re-resolve CRM links from the job's current names/emails for any link
    # that is still empty (explicit ids set above are preserved).
    resolved = _auto_link_crm(db, {
        "vendor": job.vendor, "vendor_id": job.vendor_id,
        "client": job.client, "client_id": job.client_id,
        "end_client": job.end_client, "end_client_id": job.end_client_id,
        "recruiter_name": job.recruiter_name, "recruiter_email": job.recruiter_email,
        "recruiter_contact_id": job.recruiter_contact_id,
    })
    job.vendor_id = resolved.get("vendor_id")
    job.client_id = resolved.get("client_id")
    job.end_client_id = resolved.get("end_client_id")
    job.recruiter_contact_id = resolved.get("recruiter_contact_id")

    db.commit()
    db.refresh(job)
    log_audit(db, "job.updated", "job_requirement", job.id, f"Updated job {job.job_title}", principal.user_id)
    return _to_response(job)


@router.delete("/{job_id}")
async def delete_job_requirement(
    job_id: int,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    job = _get_job_or_404(db, job_id)
    title = job.job_title
    db.delete(job)
    db.commit()
    log_audit(db, "job.deleted", "job_requirement", job_id, f"Deleted job {title}", principal.user_id)
    return {"message": "Job requirement deleted."}
