from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from database import get_db
from models import (
    JobApplication,
    JobApplicationCreate,
    JobApplicationUpdate,
    JobApplicationResponse,
)
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel


class BulkDeleteRequest(BaseModel):
    ids: List[int]

router = APIRouter()

VALID_STATUSES = {"Applied", "Interviewing", "Offer", "Rejected", "Saved"}


def require_guest_id(x_guest_id: Optional[str] = Header(None, alias="X-Guest-Id")) -> str:
    guest_id = (x_guest_id or "").strip()
    if not guest_id:
        raise HTTPException(status_code=400, detail="X-Guest-Id header is required.")
    return guest_id


def jobs_for_guest(db: Session, guest_id: str):
    return db.query(JobApplication).filter(JobApplication.guest_id == guest_id)


def get_guest_job(db: Session, guest_id: str, job_id: int) -> JobApplication:
    job = jobs_for_guest(db, guest_id).filter(JobApplication.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job application not found.")
    return job


DEMO_JOBS = [
    # Applied x5
    {"company": "Google",    "role": "Software Engineer",       "status": "Applied",      "location": "Mountain View, CA", "salary_range": "$150k – $220k", "job_url": "https://careers.google.com"},
    {"company": "Microsoft", "role": "Product Manager",         "status": "Applied",      "location": "Redmond, WA",       "salary_range": "$130k – $180k", "job_url": "https://careers.microsoft.com"},
    {"company": "Amazon",    "role": "Backend Engineer",        "status": "Applied",      "location": "Seattle, WA",       "salary_range": "$140k – $200k", "job_url": "https://amazon.jobs"},
    {"company": "Shopify",   "role": "Full Stack Developer",    "status": "Applied",      "location": "Remote",            "salary_range": "$110k – $150k", "job_url": "https://www.shopify.com/careers"},
    {"company": "Airbnb",    "role": "Frontend Engineer",       "status": "Applied",      "location": "San Francisco, CA", "salary_range": "$140k – $190k", "job_url": "https://careers.airbnb.com"},
    # Interviewing x2
    {"company": "Stripe",    "role": "Senior Engineer",         "status": "Interviewing", "location": "Remote",            "salary_range": "$160k – $220k", "job_url": "https://stripe.com/jobs"},
    {"company": "Meta",      "role": "Data Scientist",          "status": "Interviewing", "location": "Menlo Park, CA",    "salary_range": "$150k – $210k", "job_url": "https://metacareers.com"},
    # Offer x1
    {"company": "Vercel",    "role": "Developer Advocate",      "status": "Offer",        "location": "Remote",            "salary_range": "$100k – $140k", "job_url": "https://vercel.com/careers"},
    # Rejected x3
    {"company": "Twitter",   "role": "ML Engineer",             "status": "Rejected",     "location": "San Francisco, CA", "salary_range": "$150k – $200k", "job_url": "https://careers.twitter.com"},
    {"company": "LinkedIn",  "role": "Software Engineer",       "status": "Rejected",     "location": "Sunnyvale, CA",     "salary_range": "$130k – $170k", "job_url": "https://careers.linkedin.com"},
    {"company": "Uber",      "role": "Platform Engineer",       "status": "Rejected",     "location": "San Francisco, CA", "salary_range": "$140k – $185k", "job_url": "https://www.uber.com/us/en/careers"},
    # Saved x1
    {"company": "Netflix",   "role": "Senior Frontend Engineer","status": "Saved",        "location": "Los Gatos, CA",     "salary_range": "$170k – $250k", "job_url": "https://jobs.netflix.com"},
]


@router.post("/demo", status_code=201)
async def load_demo_jobs(
    guest_id: str = Depends(require_guest_id),
    db: Session = Depends(get_db),
):
    for job_data in DEMO_JOBS:
        if jobs_for_guest(db, guest_id).filter(
            JobApplication.company == job_data["company"],
            JobApplication.role == job_data["role"],
        ).first():
            raise HTTPException(
                status_code=409,
                detail="Demo jobs already loaded. Delete existing jobs first if you want to reload.",
            )
    created = []
    for job_data in DEMO_JOBS:
        db_job = JobApplication(**job_data, guest_id=guest_id)
        db.add(db_job)
        created.append(job_data["company"])
    db.commit()
    return {"message": f"Loaded {len(created)} demo jobs.", "companies": created}


@router.delete("/all")
async def clear_all_jobs(
    guest_id: str = Depends(require_guest_id),
    db: Session = Depends(get_db),
):
    count = jobs_for_guest(db, guest_id).delete(synchronize_session=False)
    db.commit()
    return {"message": f"Deleted {count} job applications."}


@router.delete("/bulk")
async def bulk_delete_jobs(
    body: BulkDeleteRequest,
    guest_id: str = Depends(require_guest_id),
    db: Session = Depends(get_db),
):
    if not body.ids:
        raise HTTPException(status_code=400, detail="No IDs provided.")
    count = (
        jobs_for_guest(db, guest_id)
        .filter(JobApplication.id.in_(body.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"message": f"Deleted {count} job application(s)."}


@router.get("/stats/summary")
async def get_stats(
    guest_id: str = Depends(require_guest_id),
    db: Session = Depends(get_db),
):
    q = jobs_for_guest(db, guest_id)
    total = q.count()
    by_status = {s: q.filter(JobApplication.status == s).count() for s in VALID_STATUSES}
    return {"total": total, "by_status": by_status}


@router.get("/", response_model=List[JobApplicationResponse])
async def list_jobs(
    status: Optional[str] = None,
    guest_id: str = Depends(require_guest_id),
    db: Session = Depends(get_db),
):
    q = jobs_for_guest(db, guest_id)
    if status:
        q = q.filter(JobApplication.status == status)
    return q.order_by(JobApplication.created_at.desc()).all()


@router.post("/", response_model=JobApplicationResponse, status_code=201)
async def create_job(
    job: JobApplicationCreate,
    guest_id: str = Depends(require_guest_id),
    db: Session = Depends(get_db),
):
    duplicate = jobs_for_guest(db, guest_id).filter(
        JobApplication.company == job.company,
        JobApplication.role == job.role,
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=409,
            detail=f"A '{job.role}' application for {job.company} already exists.",
        )
    db_job = JobApplication(**job.model_dump(exclude_none=True), guest_id=guest_id)
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job


@router.get("/{job_id}", response_model=JobApplicationResponse)
async def get_job(
    job_id: int,
    guest_id: str = Depends(require_guest_id),
    db: Session = Depends(get_db),
):
    return get_guest_job(db, guest_id, job_id)


@router.put("/{job_id}", response_model=JobApplicationResponse)
async def update_job(
    job_id: int,
    update: JobApplicationUpdate,
    guest_id: str = Depends(require_guest_id),
    db: Session = Depends(get_db),
):
    job = get_guest_job(db, guest_id, job_id)
    for key, value in update.model_dump(exclude_none=True).items():
        setattr(job, key, value)
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}")
async def delete_job(
    job_id: int,
    guest_id: str = Depends(require_guest_id),
    db: Session = Depends(get_db),
):
    job = get_guest_job(db, guest_id, job_id)
    db.delete(job)
    db.commit()
    return {"message": "Deleted successfully."}
