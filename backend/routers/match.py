from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import json
import logging

from database import get_db
from models import MatchRequest, JobMatch, JobRequirement
from services.claude_service import match_job, generate_resume_bullets, create_interview_questions
from services.ai_errors import raise_clean_ai_error
from auth import Owner, get_owner, owned, log_activity
from routers.public_jobs import _to_public_detail
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


class BulletsRequest(BaseModel):
    resume_text: str
    job_description: str


@router.post("/")
async def match_resume_to_job(
    request: MatchRequest,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    if len(request.resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume text is too short.")
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short.")
    try:
        result = await match_job(request.resume_text, request.job_description)
    except Exception as e:
        raise_clean_ai_error(logger, "Match analysis", e)

    # If this match was run against a job selected from the internal ATS,
    # store a point-in-time snapshot so this historical result stays intact
    # even if the source job is later edited, unpublished, or closed.
    job_snapshot_json = None
    job_requirement_id = None
    company_name = request.company_name
    if request.job_requirement_id is not None:
        job = db.query(JobRequirement).filter(JobRequirement.id == request.job_requirement_id).first()
        if job:
            job_requirement_id = job.id
            job_snapshot_json = json.dumps(_to_public_detail(job).model_dump(mode="json"))
            company_name = company_name or job.client or job.vendor

    db.add(JobMatch(
        resume_text=request.resume_text,
        job_description=request.job_description,
        company_name=company_name,
        job_requirement_id=job_requirement_id,
        job_snapshot_json=job_snapshot_json,
        match_json=json.dumps(result),
        guest_id=owner.guest_id,
        user_id=owner.user_id,
    ))
    db.commit()
    log_activity(
        db, owner, "job_matched",
        f"Matched resume — Score: {result.get('match_score', 0)}%",
        f"Likelihood: {result.get('likelihood', 'n/a')}",
    )
    return result


@router.get("/history", response_model=List[dict])
async def match_history(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    rows = (
        owned(db.query(JobMatch), JobMatch, owner)
        .order_by(JobMatch.created_at.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": r.id,
            "resume_text": r.resume_text,
            "job_description": r.job_description,
            "company_name": r.company_name,
            "job_requirement_id": r.job_requirement_id,
            "job_snapshot": json.loads(r.job_snapshot_json) if r.job_snapshot_json else None,
            "match": json.loads(r.match_json) if r.match_json else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.post("/resume-bullets")
async def get_resume_bullets(
    request: BulletsRequest,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    if len(request.resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume text is too short.")
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short.")
    try:
        bullets = await generate_resume_bullets(request.resume_text, request.job_description)
    except Exception as e:
        raise_clean_ai_error(logger, "Bullet generation", e)
    log_activity(db, owner, "bullets_generated", f"Generated {len(bullets)} improved resume bullets")
    return {"bullets": bullets}


@router.post("/interview-questions")
async def get_interview_questions(
    request: BulletsRequest,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    if len(request.resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume text is too short.")
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short.")
    try:
        questions = await create_interview_questions(request.resume_text, request.job_description)
    except Exception as e:
        raise_clean_ai_error(logger, "Interview question generation", e)
    log_activity(db, owner, "questions_generated", f"Generated {len(questions)} interview questions")
    return {"questions": questions}
