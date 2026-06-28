from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models import (
    JobApplication,
    JobApplicationCreate,
    JobApplicationUpdate,
    JobApplicationResponse,
    FollowUpEmailResponse,
)
from services.claude_service import generate_follow_up_email
from auth import Owner, get_owner, owned, log_activity
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel


class BulkDeleteRequest(BaseModel):
    ids: List[int]

router = APIRouter()

VALID_STATUSES = {"Applied", "Interviewing", "Offer", "Rejected", "Saved"}


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
    try:
        email = await generate_follow_up_email(
            company=job.company,
            role=job.role,
            recruiter_contact=job.recruiter_contact or "",
            notes=job.notes or "",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")
    log_activity(db, owner, "cover_letter_generated", f"Drafted follow-up email for {job.company} — {job.role}")
    return email


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
