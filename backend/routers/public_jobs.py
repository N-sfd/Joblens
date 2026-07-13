"""The CRM/ATS's job-publishing surface for JobLens (mounted at
/api/integrations/joblens/jobs — see main.py).

This is the CRM/ATS's side of the JobLens integration: it stays inside the
same backend and database as the rest of the ATS (see the architecture note
in routers/job_requirements.py's module docstring for why), but is public —
same `get_owner` guest/user pattern as routers/jobs.py and routers/match.py,
not Clerk-gated — since JobLens calls it directly from the browser like every
other public route in this app.

A job is only returned once all three publishing gates align:
  1. `published_for_matching=True` — the recruiter's publish toggle.
  2. `review_status="Approved"` — staff has reviewed and approved it.
  3. `status not in PUBLIC_CLOSED_JOB_STATUSES` — the requisition is still open.

Internal-only fields (raw email text, recruiter notes, submission
instructions, CRM linkage ids, other candidates/submissions/offers — none of
which this router ever queries in the first place) are never included in the
response.
"""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    JobRequirement,
    JobRequirementResponse,
    PublicJobListing,
    PublicJobListResponse,
    PUBLIC_CLOSED_JOB_STATUSES,
)
from auth import Owner, get_owner, log_activity
from services.rate_limit import check_rate_limit

router = APIRouter()

PUBLIC_JOBS_RATE_LIMIT = 60  # browse-only reads; generous vs. the AI-call limits


def _loads(value) -> list:
    if not value:
        return []
    try:
        data = json.loads(value)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _visible_query(db: Session):
    return db.query(JobRequirement).filter(
        JobRequirement.published_for_matching.is_(True),
        JobRequirement.review_status == "Approved",
        JobRequirement.status.notin_(PUBLIC_CLOSED_JOB_STATUSES),
    )


def _rate_limit_key(owner: Owner) -> str | None:
    return str(owner.user_id) if owner.user_id else owner.guest_id


def _to_listing(job: JobRequirement) -> PublicJobListing:
    return PublicJobListing(
        id=job.id,
        job_title=job.job_title,
        job_reference_number=job.job_reference_number,
        client=job.client,
        vendor=job.vendor,
        location=job.location,
        work_type=job.work_type,
        employment_type=job.employment_type,
        rate=job.rate,
        required_skills=_loads(job.required_skills),
        source=job.source,
        received_at=job.received_at,
    )


def _to_public_detail(job: JobRequirement) -> JobRequirementResponse:
    """Candidate-safe projection — deliberately omits raw_email_text, notes,
    submission_instructions, CRM link ids/names, created_by, priority, and
    source, none of which belong in front of a public JobLens user."""
    return JobRequirementResponse(
        id=job.id,
        job_title=job.job_title,
        job_reference_number=job.job_reference_number,
        vendor=job.vendor,
        recruiter_name=job.recruiter_name,
        recruiter_email=job.recruiter_email,
        recruiter_phone=job.recruiter_phone,
        client=job.client,
        end_client=job.end_client,
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
        required_skills=_loads(job.required_skills),
        preferred_skills=_loads(job.preferred_skills),
        minimum_experience=job.minimum_experience,
        education_requirement=job.education_requirement,
        certification_requirement=job.certification_requirement,
        job_description=job.job_description,
        application_url=job.application_url,
        application_platform=getattr(job, "application_platform", None),
        number_of_openings=job.number_of_openings,
        status=job.status,
        received_at=job.received_at,
        published_for_matching=True,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/", response_model=PublicJobListResponse)
async def list_public_jobs(
    request: Request,
    q: str | None = Query(None),
    location: str | None = Query(None),
    work_type: str | None = Query(None),
    employment_type: str | None = Query(None),
    client: str | None = Query(None),
    skills: str | None = Query(None, description="Comma-separated skills to filter by"),
    since: datetime | None = Query(None, description="Only jobs received on/after this timestamp"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    check_rate_limit(request, bucket="public_jobs", limit=PUBLIC_JOBS_RATE_LIMIT, user_id=_rate_limit_key(owner))

    query = _visible_query(db)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(
            JobRequirement.job_title.ilike(term),
            JobRequirement.client.ilike(term),
            JobRequirement.vendor.ilike(term),
            JobRequirement.required_skills.ilike(term),
        ))
    if location:
        query = query.filter(JobRequirement.location.ilike(f"%{location.strip()}%"))
    if work_type:
        query = query.filter(JobRequirement.work_type == work_type)
    if employment_type:
        query = query.filter(JobRequirement.employment_type == employment_type)
    if client:
        query = query.filter(JobRequirement.client.ilike(f"%{client.strip()}%"))
    if skills:
        for skill in [s.strip() for s in skills.split(",") if s.strip()]:
            term = f"%{skill}%"
            query = query.filter(or_(
                JobRequirement.required_skills.ilike(term),
                JobRequirement.preferred_skills.ilike(term),
            ))
    if since:
        query = query.filter(JobRequirement.received_at >= since)

    total = query.count()
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    jobs = (
        query.order_by(JobRequirement.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return PublicJobListResponse(
        items=[_to_listing(j) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{job_id}", response_model=JobRequirementResponse)
async def get_public_job(
    job_id: int,
    request: Request,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    check_rate_limit(request, bucket="public_jobs", limit=PUBLIC_JOBS_RATE_LIMIT, user_id=_rate_limit_key(owner))

    job = _visible_query(db).filter(JobRequirement.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="This job is no longer available.")

    log_activity(
        db, owner, "job_imported",
        f"Imported {job.job_title} — {job.client or job.vendor or 'Unknown'}",
        str(job.id),
    )
    return _to_public_detail(job)
