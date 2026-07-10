"""Phase 8: Interview tracking for submissions."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import (
    INTERVIEW_OUTCOMES,
    INTERVIEW_STATUSES,
    Employee,
    Interview,
    InterviewCreate,
    InterviewResponse,
    InterviewUpdate,
    Submission,
    JobRequirement,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_writer
from services.audit import log_audit

router = APIRouter()


def _employee_name(emp: Employee | None) -> str | None:
    if not emp:
        return None
    return " ".join(p for p in [emp.first_name, emp.last_name] if p).strip() or emp.name


def _to_response(row: Interview, db: Session) -> InterviewResponse:
    sub = db.query(Submission).filter(Submission.id == row.submission_id).first()
    job = db.query(JobRequirement).filter(JobRequirement.id == sub.job_requirement_id).first() if sub else None
    emp = db.query(Employee).filter(Employee.id == sub.employee_id).first() if sub else None
    return InterviewResponse(
        id=row.id,
        submission_id=row.submission_id,
        scheduled_at=row.scheduled_at,
        interview_type=row.interview_type,
        status=row.status,
        interviewer_name=row.interviewer_name,
        location_or_link=row.location_or_link,
        notes=row.notes,
        feedback=row.feedback,
        outcome=row.outcome,
        job_title=job.job_title if job else None,
        employee_name=_employee_name(emp),
        submission_status=sub.status if sub else None,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_or_404(db: Session, interview_id: int) -> Interview:
    row = db.query(Interview).filter(Interview.id == interview_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Interview not found.")
    return row


@router.get("/", response_model=list[InterviewResponse])
async def list_interviews(
    submission_id: int | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=200),
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    q = db.query(Interview)
    if submission_id is not None:
        q = q.filter(Interview.submission_id == submission_id)
    if status:
        q = q.filter(Interview.status == status)
    rows = q.order_by(Interview.scheduled_at.desc(), Interview.created_at.desc()).limit(limit).all()
    return [_to_response(r, db) for r in rows]


@router.post("/", response_model=InterviewResponse, status_code=201)
async def create_interview(
    body: InterviewCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    if body.status not in INTERVIEW_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Use: {', '.join(INTERVIEW_STATUSES)}")
    if body.outcome not in INTERVIEW_OUTCOMES:
        raise HTTPException(status_code=422, detail=f"Invalid outcome. Use: {', '.join(INTERVIEW_OUTCOMES)}")
    sub = db.query(Submission).filter(Submission.id == body.submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found.")

    data = body.model_dump()
    data["created_by"] = principal.user_id
    row = Interview(**data)
    db.add(row)
    if sub.status not in ("Interview", "Offer", "Selected"):
        sub.status = "Interview"
        job = db.query(JobRequirement).filter(JobRequirement.id == sub.job_requirement_id).first()
        if job:
            job.status = "Interview"
    db.commit()
    db.refresh(row)
    log_audit(db, "interview.created", "interview", row.id, "interview.created", principal.user_id)
    return _to_response(row, db)


@router.patch("/{interview_id}", response_model=InterviewResponse)
async def update_interview(
    interview_id: int,
    body: InterviewUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, interview_id)
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in INTERVIEW_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Use: {', '.join(INTERVIEW_STATUSES)}")
    if "outcome" in data and data["outcome"] not in INTERVIEW_OUTCOMES:
        raise HTTPException(status_code=422, detail=f"Invalid outcome. Use: {', '.join(INTERVIEW_OUTCOMES)}")
    for key, value in data.items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    log_audit(db, "interview.updated", "interview", row.id, "interview.updated", principal.user_id)
    return _to_response(row, db)
