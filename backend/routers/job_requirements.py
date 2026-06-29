import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import (
    JobRequirement,
    JobRequirementCreate,
    JobRequirementUpdate,
    JobRequirementResponse,
    JobRequirementParseRequest,
    JobRequirementParseResponse,
)
from ats_auth import get_current_ats_user
from services.claude_service import parse_job_requirement

router = APIRouter()


def _to_response(job: JobRequirement) -> JobRequirementResponse:
    return JobRequirementResponse(
        id=job.id,
        job_title=job.job_title,
        vendor=job.vendor,
        recruiter_name=job.recruiter_name,
        recruiter_email=job.recruiter_email,
        recruiter_phone=job.recruiter_phone,
        client=job.client,
        end_client=job.end_client,
        location=job.location,
        work_type=job.work_type,
        rate=job.rate,
        duration=job.duration,
        visa_requirement=job.visa_requirement,
        required_skills=json.loads(job.required_skills) if job.required_skills else [],
        preferred_skills=json.loads(job.preferred_skills) if job.preferred_skills else [],
        job_description=job.job_description,
        raw_email_text=job.raw_email_text,
        submission_deadline=job.submission_deadline,
        status=job.status,
        priority=job.priority,
        source=job.source,
        notes=job.notes,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


def _get_job_or_404(db: Session, job_id: int) -> JobRequirement:
    job = db.query(JobRequirement).filter(JobRequirement.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job requirement not found.")
    return job


@router.post("/parse", response_model=JobRequirementParseResponse)
async def parse_job_requirement_text(
    body: JobRequirementParseRequest,
    _: None = Depends(get_current_ats_user),
):
    if len(body.raw_text.strip()) < 20:
        raise HTTPException(status_code=422, detail="Paste more of the job email/description to parse.")
    try:
        parsed = await parse_job_requirement(body.raw_text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")
    return JobRequirementParseResponse(**parsed)


@router.post("/", response_model=JobRequirementResponse, status_code=201)
async def create_job_requirement(
    body: JobRequirementCreate,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    data = body.model_dump()
    data["required_skills"] = json.dumps(data.pop("required_skills") or [])
    data["preferred_skills"] = json.dumps(data.pop("preferred_skills") or [])
    job = JobRequirement(**data)
    db.add(job)
    db.commit()
    db.refresh(job)
    return _to_response(job)


@router.get("/", response_model=list[JobRequirementResponse])
async def list_job_requirements(
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    jobs = db.query(JobRequirement).order_by(JobRequirement.created_at.desc()).all()
    return [_to_response(j) for j in jobs]


@router.get("/{job_id}", response_model=JobRequirementResponse)
async def get_job_requirement(
    job_id: int,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    return _to_response(_get_job_or_404(db, job_id))


@router.put("/{job_id}", response_model=JobRequirementResponse)
async def update_job_requirement(
    job_id: int,
    body: JobRequirementUpdate,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    job = _get_job_or_404(db, job_id)
    data = body.model_dump(exclude_unset=True)
    if "required_skills" in data and data["required_skills"] is not None:
        data["required_skills"] = json.dumps(data["required_skills"])
    if "preferred_skills" in data and data["preferred_skills"] is not None:
        data["preferred_skills"] = json.dumps(data["preferred_skills"])
    for key, value in data.items():
        setattr(job, key, value)
    db.commit()
    db.refresh(job)
    return _to_response(job)


@router.delete("/{job_id}")
async def delete_job_requirement(
    job_id: int,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    job = _get_job_or_404(db, job_id)
    db.delete(job)
    db.commit()
    return {"message": "Job requirement deleted."}
