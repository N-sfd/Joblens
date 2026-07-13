from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import (
    JobApplication,
    JobApplicationCreate,
    JobApplicationUpdate,
    JobApplicationResponse,
    FollowUpEmailResponse,
    JobRequirement,
    SaveExternalJobRequest,
)
from services.claude_service import generate_follow_up_email, parse_job_posting, generate_negotiation_advice
from services.ai_errors import raise_clean_ai_error
from routers.public_jobs import _to_public_detail
from auth import Owner, get_owner, owned, log_activity
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
from urllib.parse import urlparse
import json
import logging

logger = logging.getLogger(__name__)


class BulkDeleteRequest(BaseModel):
    ids: List[int]


class JobPostingParseRequest(BaseModel):
    raw_text: str

router = APIRouter()

VALID_STATUSES = {
    "Saved", "Application Opened", "Application In Progress", "Applied",
    "Recruiter Contacted", "Interviewing", "Offer", "Rejected", "Withdrawn",
}

# Statuses that automatic/semi-automatic actions (Save Job, Apply Now, Contact
# Recruiter) must never overwrite — they only change via an explicit user
# action (the tracker's status dropdown, or the dedicated mark-applied
# endpoint below). Applied is included so reopening an employer URL can't
# silently downgrade a job back to "Application Opened".
AUTO_GUARD_STATUSES = {"Interviewing", "Offer", "Rejected", "Withdrawn", "Applied"}

REMINDER_FAIL_CODE = "REMINDER_CREATION_FAILED"
REMINDER_FAIL_MESSAGE = (
    "Your application was updated, but the follow-up reminder could not be created."
)


def _resolve_auto_status(current: str, desired: str) -> str:
    if current in AUTO_GUARD_STATUSES:
        return current
    return desired


def _is_valid_http_url(value: Optional[str]) -> bool:
    if not value or not str(value).strip():
        return False
    try:
        parsed = urlparse(str(value).strip())
        return parsed.scheme in ("http", "https") and bool(parsed.netloc)
    except Exception:
        return False


def _validate_employer_application_url(job_req: JobRequirement) -> None:
    """Reject invalid / missing employer application URLs before opening Apply Now."""
    from services.application_url import normalize_application_url

    classified = normalize_application_url(job_req.application_url)
    if not classified.is_valid or not classified.normalized_url:
        if not job_req.application_url or not str(job_req.application_url).strip():
            raise HTTPException(
                status_code=422,
                detail="This job doesn't have an application link yet. Use Contact Recruiter instead.",
            )
        raise HTTPException(
            status_code=422,
            detail="This application URL doesn't look valid.",
        )
    # Persist normalized form for downstream tracker / snapshot freshness
    job_req.application_url = classified.normalized_url
    if hasattr(job_req, "application_platform"):
        job_req.application_platform = classified.platform


def _to_job_response(job: JobApplication, **warnings) -> JobApplicationResponse:
    data = JobApplicationResponse.model_validate(job).model_dump()
    data.update(warnings)
    return JobApplicationResponse(**data)


def _attach_reminder_safely(
    db: Session,
    job_id: int,
    *,
    days: int,
    reminder_type: str = "follow_up_email",
) -> dict:
    """Set follow_up_date after the status write has already committed.

    Returns reminder_created / optional warning fields. Never raises — status
    updates must stay persisted even when reminder creation fails.
    """
    try:
        job = db.query(JobApplication).filter(JobApplication.id == job_id).first()
        if not job:
            return {
                "reminder_created": False,
                "warning_code": REMINDER_FAIL_CODE,
                "warning_message": REMINDER_FAIL_MESSAGE,
            }
        if job.follow_up_date:
            return {"reminder_created": False}
        job.follow_up_date = datetime.utcnow() + timedelta(days=days)
        job.reminder_type = reminder_type
        db.commit()
        return {"reminder_created": True}
    except Exception:
        logger.exception("Reminder creation failed for job_application_id=%s", job_id)
        try:
            db.rollback()
        except Exception:
            pass
        return {
            "reminder_created": False,
            "warning_code": REMINDER_FAIL_CODE,
            "warning_message": REMINDER_FAIL_MESSAGE,
        }


def jobs_for_owner(db: Session, owner: Owner):
    return owned(db.query(JobApplication), JobApplication, owner)


def get_owned_job(db: Session, owner: Owner, job_id: int) -> JobApplication:
    job = jobs_for_owner(db, owner).filter(JobApplication.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job application not found.")
    return job


DEMO_JOBS = [
    # Applied x5 — spread across the last ~7 weeks so weekly/conversion charts have real shape
    {"company": "Google",    "role": "Software Engineer",       "status": "Applied",      "location": "Mountain View, CA", "salary_range": "$150k – $220k", "job_url": "https://careers.google.com", "days_ago": 2},
    {"company": "Microsoft", "role": "Product Manager",         "status": "Applied",      "location": "Redmond, WA",       "salary_range": "$130k – $180k", "job_url": "https://careers.microsoft.com", "days_ago": 4},
    {"company": "Amazon",    "role": "Backend Engineer",        "status": "Applied",      "location": "Seattle, WA",       "salary_range": "$140k – $200k", "job_url": "https://amazon.jobs", "days_ago": 9},
    {"company": "Shopify",   "role": "Full Stack Developer",    "status": "Applied",      "location": "Remote",            "salary_range": "$110k – $150k", "job_url": "https://www.shopify.com/careers", "days_ago": 16},
    {"company": "Airbnb",    "role": "Frontend Engineer",       "status": "Applied",      "location": "San Francisco, CA", "salary_range": "$140k – $190k", "job_url": "https://careers.airbnb.com", "days_ago": 23},
    # Interviewing x2
    {"company": "Stripe",    "role": "Senior Engineer",         "status": "Interviewing", "location": "Remote",            "salary_range": "$160k – $220k", "job_url": "https://stripe.com/jobs", "days_ago": 12},
    {"company": "Meta",      "role": "Data Scientist",          "status": "Interviewing", "location": "Menlo Park, CA",    "salary_range": "$150k – $210k", "job_url": "https://metacareers.com", "days_ago": 19},
    # Offer x1
    {"company": "Vercel",    "role": "Developer Advocate",      "status": "Offer",        "location": "Remote",            "salary_range": "$100k – $140k", "job_url": "https://vercel.com/careers", "days_ago": 30},
    # Rejected x3
    {"company": "Twitter",   "role": "ML Engineer",             "status": "Rejected",     "location": "San Francisco, CA", "salary_range": "$150k – $200k", "job_url": "https://careers.twitter.com", "days_ago": 27},
    {"company": "LinkedIn",  "role": "Software Engineer",       "status": "Rejected",     "location": "Sunnyvale, CA",     "salary_range": "$130k – $170k", "job_url": "https://careers.linkedin.com", "days_ago": 35},
    {"company": "Uber",      "role": "Platform Engineer",       "status": "Rejected",     "location": "San Francisco, CA", "salary_range": "$140k – $185k", "job_url": "https://www.uber.com/us/en/careers", "days_ago": 44},
    # Saved x1 — not yet applied, so no date_applied
    {"company": "Netflix",   "role": "Senior Frontend Engineer","status": "Saved",        "location": "Los Gatos, CA",     "salary_range": "$170k – $250k", "job_url": "https://jobs.netflix.com", "days_ago": None},
]


@router.post("/demo", status_code=201)
async def load_demo_jobs(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    for job_data in DEMO_JOBS:
        if jobs_for_owner(db, owner).filter(
            JobApplication.company == job_data["company"],
            JobApplication.role == job_data["role"],
        ).first():
            raise HTTPException(
                status_code=409,
                detail="Demo jobs already loaded. Delete existing jobs first if you want to reload.",
            )
    created = []
    now = datetime.utcnow()
    for job_data in DEMO_JOBS:
        days_ago = job_data["days_ago"]
        fields = {k: v for k, v in job_data.items() if k != "days_ago"}
        if days_ago is not None:
            fields["date_applied"] = now - timedelta(days=days_ago)
        db_job = JobApplication(**fields, guest_id=owner.guest_id, user_id=owner.user_id)
        db.add(db_job)
        created.append(job_data["company"])
    db.commit()
    return {"message": f"Loaded {len(created)} demo jobs.", "companies": created}


@router.delete("/all")
async def clear_all_jobs(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    count = jobs_for_owner(db, owner).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Deleted {count} job applications."}


@router.delete("/bulk")
async def bulk_delete_jobs(
    body: BulkDeleteRequest,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="No IDs provided.")
    count = (
        jobs_for_owner(db, owner)
        .filter(JobApplication.id.in_(body.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"message": f"Deleted {count} job application(s)."}


@router.get("/stats/summary")
async def get_stats(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    q = jobs_for_owner(db, owner)
    total = q.count()
    by_status = {s: q.filter(JobApplication.status == s).count() for s in VALID_STATUSES}
    return {"total": total, "by_status": by_status}


@router.get("/reminders", response_model=List[JobApplicationResponse])
async def list_reminders(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    return (
        jobs_for_owner(db, owner)
        .filter(JobApplication.follow_up_date.is_not(None))
        .order_by(JobApplication.follow_up_date.asc())
        .all()
    )


@router.post("/parse")
async def parse_job_posting_text(
    body: JobPostingParseRequest,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    if len(body.raw_text.strip()) < 30:
        raise HTTPException(status_code=422, detail="Paste more of the job posting to auto-fill from it.")
    try:
        parsed = await parse_job_posting(body.raw_text)
    except Exception as e:
        raise_clean_ai_error(logger, "Job posting parsing", e)
    return parsed


@router.get("/", response_model=List[JobApplicationResponse])
async def list_jobs(
    status: Optional[str] = None,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    q = jobs_for_owner(db, owner)
    if status:
        q = q.filter(JobApplication.status == status)
    return q.order_by(JobApplication.created_at.desc()).all()


@router.post("/", response_model=JobApplicationResponse, status_code=201)
async def create_job(
    job: JobApplicationCreate,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    duplicate = jobs_for_owner(db, owner).filter(
        JobApplication.company == job.company,
        JobApplication.role == job.role,
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"A '{job.role}' application for {job.company} already exists.",
        )
    db_job = JobApplication(
        **job.model_dump(exclude_none=True), guest_id=owner.guest_id, user_id=owner.user_id
    )
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    log_activity(db, owner, "job_added", f"Added {job.company} — {job.role}", job.status)
    return db_job


@router.post("/from-external", response_model=JobApplicationResponse, status_code=201)
async def save_external_job(
    body: SaveExternalJobRequest,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    """Save Job / Add to Tracker / Apply Now / Contact Recruiter from a
    published CRM/ATS job (Discover Jobs / Job Details page). Idempotent on
    source_job_requirement_id — re-saving the same job updates the existing
    tracker row instead of creating a duplicate, and never overwrites a
    protected status (see AUTO_GUARD_STATUSES)."""
    if body.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Must be one of: {', '.join(sorted(VALID_STATUSES))}")

    job_req = db.query(JobRequirement).filter(JobRequirement.id == body.job_requirement_id).first()
    if not job_req:
        raise HTTPException(status_code=404, detail="This job is no longer available.")

    now = datetime.utcnow()
    snapshot_json = json.dumps(_to_public_detail(job_req).model_dump(mode="json"))
    is_apply_open = body.application_method == "employer_website"
    is_contact = body.status == "Recruiter Contacted"

    if is_apply_open:
        _validate_employer_application_url(job_req)

    existing = (
        jobs_for_owner(db, owner)
        .filter(JobApplication.source_job_requirement_id == job_req.id)
        .first()
    )

    reminder_meta: dict = {}

    if existing:
        resolved = _resolve_auto_status(existing.status, body.status)
        status_changed = resolved != existing.status
        existing.status = resolved
        existing.job_snapshot_json = snapshot_json  # keep the snapshot fresh while the source is still live
        existing.last_activity_at = now
        if job_req.application_url:
            existing.job_url = job_req.application_url
        if is_apply_open:
            existing.application_method = "employer_website"
            if not existing.application_opened_at:
                existing.application_opened_at = now
        needs_contact_reminder = False
        if is_contact and not existing.recruiter_contacted_at:
            existing.recruiter_contacted_at = now
            needs_contact_reminder = not existing.follow_up_date
        existing.updated_at = now
        db.commit()
        db.refresh(existing)
        if needs_contact_reminder:
            reminder_meta = _attach_reminder_safely(db, existing.id, days=3)
            db.refresh(existing)
        if status_changed:
            log_activity(db, owner, "status_changed", f"{existing.company} — {existing.role} → {existing.status}")
        elif is_apply_open:
            log_activity(db, owner, "application_opened", f"Reopened application page for {existing.company} — {existing.role}")
        return _to_job_response(existing, **reminder_meta)

    fields = {
        "company": job_req.client or job_req.vendor or job_req.job_title,
        "role": job_req.job_title,
        "status": body.status,
        "location": job_req.location,
        "work_type": job_req.work_type,
        "salary_range": job_req.rate,
        "recruiter_name": job_req.recruiter_name,
        "recruiter_email": job_req.recruiter_email,
        "notes": f"Ref #{job_req.job_reference_number}" if job_req.job_reference_number else None,
        "source_job_requirement_id": job_req.id,
        "job_snapshot_json": snapshot_json,
        "application_source": job_req.source,
        "last_activity_at": now,
    }
    if is_apply_open:
        fields["application_method"] = "employer_website"
        fields["job_url"] = job_req.application_url
        fields["application_opened_at"] = now
    elif job_req.application_url:
        # Preserve apply URL on Save / Contact so Application Status can surface it.
        fields["job_url"] = job_req.application_url
    if is_contact:
        fields["recruiter_contacted_at"] = now

    db_job = JobApplication(**fields, guest_id=owner.guest_id, user_id=owner.user_id)
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    if is_contact:
        reminder_meta = _attach_reminder_safely(db, db_job.id, days=3)
        db.refresh(db_job)
    log_activity(db, owner, "job_added", f"Added {db_job.company} — {db_job.role}", db_job.status)
    return _to_job_response(db_job, **reminder_meta)


@router.post("/{job_id}/mark-applied", response_model=JobApplicationResponse)
async def mark_applied(
    job_id: int,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    """Explicit, user-confirmed transition to Applied — the frontend gates
    this behind a confirmation dialog. Idempotent: repeat calls after
    applied_at is already set touch last_activity_at only, and never
    downgrade a protected status (Interviewing/Offer/Rejected/Withdrawn)."""
    job = get_owned_job(db, owner, job_id)
    now = datetime.utcnow()

    if job.status in AUTO_GUARD_STATUSES - {"Applied"}:
        job.last_activity_at = now
        db.commit()
        db.refresh(job)
        return _to_job_response(job)

    status_changed = job.status != "Applied"
    first_apply = not job.applied_at
    job.status = "Applied"
    if first_apply:
        job.applied_at = now
    job.last_activity_at = now
    job.updated_at = now
    db.commit()
    db.refresh(job)

    reminder_meta: dict = {}
    if first_apply and not job.follow_up_date:
        reminder_meta = _attach_reminder_safely(db, job.id, days=7)
        db.refresh(job)

    if status_changed:
        log_activity(db, owner, "status_changed", f"{job.company} — {job.role} → Applied")
    return _to_job_response(job, **reminder_meta)


@router.get("/{job_id}", response_model=JobApplicationResponse)
async def get_job(
    job_id: int,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    return get_owned_job(db, owner, job_id)


@router.put("/{job_id}", response_model=JobApplicationResponse)
async def update_job(
    job_id: int,
    update: JobApplicationUpdate,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    job = get_owned_job(db, owner, job_id)
    changes = update.model_dump(exclude_unset=True)
    status_changed = "status" in changes and changes["status"] != job.status
    for key, value in changes.items():
        setattr(job, key, value)
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    if status_changed:
        log_activity(db, owner, "status_changed", f"{job.company} — {job.role} → {job.status}")
    return job


@router.post("/{job_id}/follow-up-email", response_model=FollowUpEmailResponse)
async def follow_up_email(
    job_id: int,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    job = get_owned_job(db, owner, job_id)
    recruiter_contact = " - ".join(p for p in (job.recruiter_name, job.recruiter_email) if p)
    try:
        email = await generate_follow_up_email(
            company=job.company,
            role=job.role,
            recruiter_contact=recruiter_contact,
            notes=job.notes or "",
        )
    except Exception as e:
        raise_clean_ai_error(logger, "Follow-up email generation", e)
    log_activity(db, owner, "cover_letter_generated", f"Drafted follow-up email for {job.company} — {job.role}")
    return email


@router.post("/{job_id}/negotiate")
async def negotiate_offer(
    job_id: int,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    job = get_owned_job(db, owner, job_id)
    try:
        advice = await generate_negotiation_advice(
            company=job.company,
            role=job.role,
            salary_range=job.salary_range or "",
            notes=job.notes or "",
        )
    except Exception as e:
        raise_clean_ai_error(logger, "Negotiation advice generation", e)
    log_activity(db, owner, "negotiation_advice", f"Generated negotiation advice for {job.company} — {job.role}")
    return advice


@router.delete("/{job_id}")
async def delete_job(
    job_id: int,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    job = get_owned_job(db, owner, job_id)
    summary = f"Deleted {job.company} — {job.role}"
    db.delete(job)
    db.commit()
    log_activity(db, owner, "job_deleted", summary)
    return {"message": "Deleted successfully."}
