"""The CRM/ATS's job-publishing surface for JobLens (mounted at
/api/integrations/joblens/jobs — see main.py).

A job is only returned once all three publishing gates align:
  1. `published_for_matching=True` — the recruiter's publish toggle.
  2. `review_status="Approved"` — staff has reviewed and approved it.
  3. `status not in PUBLIC_CLOSED_JOB_STATUSES` — the requisition is still open.

Zoho / recruiter-email jobs without an application_url are included when the
gates pass — JobLens uses Contact Recruiter as the apply method.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
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
from services.job_publish import exclusion_reason, log_publish_decision

logger = logging.getLogger("joblens.public_jobs")

router = APIRouter()

PUBLIC_JOBS_RATE_LIMIT = 60


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


def _source_label(source: str | None, platform: str | None) -> str | None:
    raw = (source or "").strip()
    plat = (platform or "").strip().lower()
    if plat == "recruiter_email" or raw.lower() in ("zoho mail", "email copy/paste"):
        return "Email Imported"
    if plat == "greenhouse" or "greenhouse" in raw.lower():
        return "Published Job"
    if raw:
        return raw
    return "Published Job"


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
        # Candidate-facing badge (Email Imported / Published Job / …).
        source=_source_label(job.source, getattr(job, "application_platform", None)),
        application_platform=getattr(job, "application_platform", None),
        application_url=job.application_url,
        recruiter_name=job.recruiter_name,
        received_at=job.received_at,
    )


def _to_public_detail(job: JobRequirement) -> JobRequirementResponse:
    """Candidate-safe projection — omits raw_email_text, notes, submission_instructions."""
    return JobRequirementResponse(
        id=job.id,
        job_title=job.job_title,
        external_job_id=job.external_job_id,
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
        source=_source_label(job.source, getattr(job, "application_platform", None)) or job.source,
        received_at=job.received_at,
        published_for_matching=True,
        review_status=job.review_status or "Approved",
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/")
async def list_public_jobs(
    request: Request,
    response: Response,
    q: str | None = Query(None),
    location: str | None = Query(None),
    work_type: str | None = Query(None),
    employment_type: str | None = Query(None),
    client: str | None = Query(None),
    source: str | None = Query(None, description="Filter: zoho|email|greenhouse|manual"),
    skills: str | None = Query(None, description="Comma-separated skills to filter by"),
    since: datetime | None = Query(None, description="Only jobs received on/after this timestamp"),
    debug: bool = Query(False, description="Dev-only: include exclusion diagnostics"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    # Never serve a stale empty list after a job is newly published.
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
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
    if source:
        s = source.strip().lower()
        if s in ("zoho", "email", "zoho_mail", "email_imported"):
            query = query.filter(or_(
                JobRequirement.source.ilike("%zoho%"),
                JobRequirement.source.ilike("%email%"),
                JobRequirement.application_platform == "recruiter_email",
            ))
        elif s == "greenhouse":
            query = query.filter(or_(
                JobRequirement.application_platform == "greenhouse",
                JobRequirement.source.ilike("%greenhouse%"),
            ))
        elif s in ("manual", "other"):
            query = query.filter(~JobRequirement.source.ilike("%zoho%"))
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

    for j in jobs:
        log_publish_decision(
            job_id=j.id,
            review_status=j.review_status,
            status=j.status,
            published=bool(j.published_for_matching),
            source=j.source,
            included=True,
        )

    payload = PublicJobListResponse(
        items=[_to_listing(j) for j in jobs],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )

    # Optional diagnostics for local/dev only — never in production responses.
    if debug and os.getenv("ENV", "development").strip().lower() not in ("production", "prod"):
        excluded = []
        for row in db.query(JobRequirement).order_by(JobRequirement.id.desc()).limit(50).all():
            reason = exclusion_reason(row)
            if reason:
                excluded.append({"id": row.id, "title": row.job_title, "reason": reason, "source": row.source})
                log_publish_decision(
                    job_id=row.id,
                    review_status=row.review_status,
                    status=row.status,
                    published=bool(row.published_for_matching),
                    source=row.source,
                    included=False,
                    reason=reason,
                )
        body = payload.model_dump(mode="json")
        body["diagnostics"] = {"excluded_sample": excluded, "note": "dev-only"}
        return body

    return payload


@router.get("/{job_id}", response_model=JobRequirementResponse)
async def get_public_job(
    job_id: int,
    request: Request,
    response: Response,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    check_rate_limit(request, bucket="public_jobs", limit=PUBLIC_JOBS_RATE_LIMIT, user_id=_rate_limit_key(owner))

    job = _visible_query(db).filter(JobRequirement.id == job_id).first()
    if not job:
        # Log why this id is missing (safe fields only).
        row = db.query(JobRequirement).filter(JobRequirement.id == job_id).first()
        if row:
            reason = exclusion_reason(row) or "filtered_out"
            log_publish_decision(
                job_id=row.id,
                review_status=row.review_status,
                status=row.status,
                published=bool(row.published_for_matching),
                source=row.source,
                included=False,
                reason=reason,
            )
        raise HTTPException(status_code=404, detail="This job is no longer available.")

    log_activity(
        db, owner, "job_imported",
        f"Imported {job.job_title} — {job.client or job.vendor or 'Unknown'}",
        str(job.id),
    )
    return _to_public_detail(job)
