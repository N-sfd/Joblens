"""Phase 8: Client/vendor submissions for matched employees."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import (
    SUBMISSION_STATUSES,
    CRMContact,
    CRMOrganization,
    Employee,
    JobEmployeeSend,
    JobRequirement,
    Submission,
    SubmissionCreate,
    SubmissionResponse,
    SubmissionUpdate,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_writer
from services.audit import log_audit

router = APIRouter()

ACTIVE_SUBMISSION_STATUSES = {
    "Draft", "Employee Contacted", "Employee Interested", "Submitted",
    "Client Review", "Interview", "Offer", "Selected",
}


def _employee_name(emp: Employee | None) -> str | None:
    if not emp:
        return None
    parts = [emp.first_name, emp.last_name]
    name = " ".join(p for p in parts if p).strip()
    return name or emp.name


def _contact_name(c: CRMContact | None) -> str | None:
    if not c:
        return None
    name = " ".join(p for p in [c.first_name, c.last_name] if p).strip()
    return name or c.email


def _to_response(row: Submission, db: Session) -> SubmissionResponse:
    job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
    emp = db.query(Employee).filter(Employee.id == row.employee_id).first()
    vendor = db.query(CRMOrganization).filter(CRMOrganization.id == row.vendor_id).first() if row.vendor_id else None
    recruiter = db.query(CRMContact).filter(CRMContact.id == row.recruiter_contact_id).first() if row.recruiter_contact_id else None
    return SubmissionResponse(
        id=row.id,
        job_requirement_id=row.job_requirement_id,
        employee_id=row.employee_id,
        recruiter_contact_id=row.recruiter_contact_id,
        vendor_id=row.vendor_id,
        job_employee_send_id=row.job_employee_send_id,
        submitted_rate=row.submitted_rate,
        rate_type=row.rate_type,
        submission_date=row.submission_date,
        status=row.status,
        vendor_reference=row.vendor_reference,
        notes=row.notes,
        job_title=job.job_title if job else None,
        employee_name=_employee_name(emp),
        vendor_name=vendor.organization_name if vendor else (job.vendor if job else None),
        recruiter_name=_contact_name(recruiter) or (job.recruiter_name if job else None),
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _sync_job_status(job: JobRequirement | None, submission_status: str) -> None:
    if not job:
        return
    mapping = {
        "Submitted": "Submitted",
        "Client Review": "Submitted",
        "Interview": "Interview",
        "Offer": "Offer",
        "Selected": "Selected",
        "Employee Interested": "Employee Interested",
    }
    new_status = mapping.get(submission_status)
    if new_status:
        job.status = new_status


def _get_or_404(db: Session, submission_id: int) -> Submission:
    row = db.query(Submission).filter(Submission.id == submission_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Submission not found.")
    return row


@router.get("/", response_model=list[SubmissionResponse])
async def list_submissions(
    job_requirement_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    status: str | None = Query(None),
    active_only: bool = Query(False),
    limit: int = Query(100, ge=1, le=200),
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    q = db.query(Submission)
    if job_requirement_id is not None:
        q = q.filter(Submission.job_requirement_id == job_requirement_id)
    if employee_id is not None:
        q = q.filter(Submission.employee_id == employee_id)
    if status:
        q = q.filter(Submission.status == status)
    if active_only:
        q = q.filter(Submission.status.in_(ACTIVE_SUBMISSION_STATUSES))
    rows = q.order_by(Submission.updated_at.desc()).limit(limit).all()
    return [_to_response(r, db) for r in rows]


@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_submission(
    submission_id: int,
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    return _to_response(_get_or_404(db, submission_id), db)


@router.post("/", response_model=SubmissionResponse, status_code=201)
async def create_submission(
    body: SubmissionCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    if body.status not in SUBMISSION_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Use: {', '.join(SUBMISSION_STATUSES)}")
    job = db.query(JobRequirement).filter(JobRequirement.id == body.job_requirement_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job requirement not found.")
    emp = db.query(Employee).filter(Employee.id == body.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")

    data = body.model_dump()
    if not data.get("vendor_id") and job.vendor_id:
        data["vendor_id"] = job.vendor_id
    if not data.get("recruiter_contact_id") and job.recruiter_contact_id:
        data["recruiter_contact_id"] = job.recruiter_contact_id
    if not data.get("submitted_rate"):
        data["submitted_rate"] = emp.expected_rate
    if not data.get("submission_date"):
        data["submission_date"] = datetime.utcnow()
    if principal.user_id:
        data["created_by"] = principal.user_id

    row = Submission(**data)
    db.add(row)
    _sync_job_status(job, row.status)
    db.commit()
    db.refresh(row)
    log_audit(db, "submission.created", "submission", row.id, "submission.created", principal.user_id)
    return _to_response(row, db)


@router.post("/from-job-send/{send_id}", response_model=SubmissionResponse, status_code=201)
async def create_submission_from_job_send(
    send_id: int,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    send = db.query(JobEmployeeSend).filter(JobEmployeeSend.id == send_id).first()
    if not send:
        raise HTTPException(status_code=404, detail="Job send not found.")
    existing = db.query(Submission).filter(Submission.job_employee_send_id == send_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Submission #{existing.id} already exists for this job send.")

    job = db.query(JobRequirement).filter(JobRequirement.id == send.job_requirement_id).first()
    emp = db.query(Employee).filter(Employee.id == send.employee_id).first()
    if not job or not emp:
        raise HTTPException(status_code=404, detail="Linked job or employee not found.")

    status = "Employee Interested" if send.employee_response == "Interested" else "Draft"
    row = Submission(
        job_requirement_id=send.job_requirement_id,
        employee_id=send.employee_id,
        job_employee_send_id=send.id,
        recruiter_contact_id=job.recruiter_contact_id,
        vendor_id=job.vendor_id,
        submitted_rate=emp.expected_rate,
        submission_date=datetime.utcnow(),
        status=status,
        notes=f"Created from job send (match {send.match_score_at_send}%)" if send.match_score_at_send else "Created from job send",
        created_by=principal.user_id,
    )
    db.add(row)
    _sync_job_status(job, status)
    db.commit()
    db.refresh(row)
    log_audit(db, "submission.created", "submission", row.id, "submission.created", principal.user_id)
    return _to_response(row, db)


@router.patch("/{submission_id}", response_model=SubmissionResponse)
async def update_submission(
    submission_id: int,
    body: SubmissionUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id)
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in SUBMISSION_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Use: {', '.join(SUBMISSION_STATUSES)}")
    for key, value in data.items():
        setattr(row, key, value)
    job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
    if "status" in data:
        _sync_job_status(job, row.status)
    db.commit()
    db.refresh(row)
    log_audit(db, "submission.updated", "submission", row.id, "submission.updated", principal.user_id)
    return _to_response(row, db)
