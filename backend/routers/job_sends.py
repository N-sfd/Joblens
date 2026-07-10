"""Phase 7: Send job opportunities to employees and track responses."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import (
    DELIVERY_STATUS_VALUES,
    EMPLOYEE_RESPONSE_VALUES,
    Employee,
    JobEmployeeSend,
    JobRequirement,
    JobSendCreate,
    JobSendDraftResponse,
    JobSendResponse,
    JobSendUpdate,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_writer
from routers.job_requirements import _get_job_or_404
from services.audit import log_audit
from services.job_employee_match import match_employees_to_job
from services.job_send_email import build_job_send_email
from models import EmployeeResume

router = APIRouter()


def _employee_name(emp: Employee) -> str:
    if emp.first_name or emp.last_name:
        return " ".join(p for p in [emp.first_name, emp.last_name] if p).strip()
    return emp.name


def _to_send_response(row: JobEmployeeSend, db: Session) -> JobSendResponse:
    job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
    emp = db.query(Employee).filter(Employee.id == row.employee_id).first()
    return JobSendResponse(
        id=row.id,
        job_requirement_id=row.job_requirement_id,
        employee_id=row.employee_id,
        job_title=job.job_title if job else None,
        employee_name=_employee_name(emp) if emp else None,
        employee_email=emp.email if emp else None,
        sent_by=row.sent_by,
        sent_at=row.sent_at,
        message_subject=row.message_subject,
        message_body=row.message_body,
        delivery_status=row.delivery_status,
        employee_response=row.employee_response,
        response_at=row.response_at,
        match_score_at_send=row.match_score_at_send,
        notes=row.notes,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_send_or_404(db: Session, send_id: int) -> JobEmployeeSend:
    row = db.query(JobEmployeeSend).filter(JobEmployeeSend.id == send_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Job send record not found.")
    return row


def _match_score_for(db: Session, job: JobRequirement, employee_id: int) -> tuple[int | None, str | None]:
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        return None, None
    resumes = db.query(EmployeeResume).filter(EmployeeResume.is_primary.is_(True)).all()
    primary_map = {r.employee_id: r for r in resumes}
    for r in db.query(EmployeeResume).order_by(EmployeeResume.uploaded_at.desc()).all():
        primary_map.setdefault(r.employee_id, r)
    matches = match_employees_to_job(job, [emp], primary_map)
    if not matches:
        return None, None
    m = matches[0]
    return m["match_score"], m.get("match_reason")


@router.get("/", response_model=list[JobSendResponse])
async def list_job_sends(
    job_requirement_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    employee_response: str | None = Query(None),
    delivery_status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=200),
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    q = db.query(JobEmployeeSend)
    if job_requirement_id is not None:
        q = q.filter(JobEmployeeSend.job_requirement_id == job_requirement_id)
    if employee_id is not None:
        q = q.filter(JobEmployeeSend.employee_id == employee_id)
    if employee_response:
        q = q.filter(JobEmployeeSend.employee_response == employee_response)
    if delivery_status:
        q = q.filter(JobEmployeeSend.delivery_status == delivery_status)
    rows = q.order_by(JobEmployeeSend.created_at.desc()).limit(limit).all()
    return [_to_send_response(r, db) for r in rows]


@router.get("/{send_id}", response_model=JobSendResponse)
async def get_job_send(
    send_id: int,
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    return _to_send_response(_get_send_or_404(db, send_id), db)


@router.post("/draft", response_model=JobSendDraftResponse)
async def preview_job_send_draft(
    job_requirement_id: int = Query(...),
    employee_id: int = Query(...),
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    job = _get_job_or_404(db, job_requirement_id)
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")
    score, reason = _match_score_for(db, job, employee_id)
    subject, body = build_job_send_email(job, emp, match_score=score, match_reason=reason)
    return JobSendDraftResponse(
        subject=subject,
        body=body,
        employee_email=emp.email,
        employee_name=_employee_name(emp),
    )


@router.post("/", response_model=JobSendResponse, status_code=201)
async def create_job_send(
    body: JobSendCreate,
    job_requirement_id: int = Query(...),
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    job = _get_job_or_404(db, job_requirement_id)
    emp = db.query(Employee).filter(Employee.id == body.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")

    score, reason = _match_score_for(db, job, body.employee_id)
    subject = body.message_subject
    message_body = body.message_body
    if not subject or not message_body:
        draft_subject, draft_body = build_job_send_email(job, emp, match_score=score, match_reason=reason)
        subject = subject or draft_subject
        message_body = message_body or draft_body

    delivery = "Sent" if body.mark_sent else "Draft"
    now = datetime.utcnow() if body.mark_sent else None

    row = JobEmployeeSend(
        job_requirement_id=job.id,
        employee_id=emp.id,
        sent_by=principal.user_id,
        sent_at=now,
        message_subject=subject,
        message_body=message_body,
        delivery_status=delivery,
        employee_response="Pending" if body.mark_sent else "Pending",
        match_score_at_send=score,
        notes=body.notes,
    )
    db.add(row)

    if body.mark_sent and job.status in ("New", "Parsed", "Ready for Match", "Matched"):
        job.status = "Sent to Employee"

    db.commit()
    db.refresh(row)
    log_audit(db, "job_send.created", "job_send", row.id, "job_send.created", principal.user_id)
    return _to_send_response(row, db)


@router.patch("/{send_id}", response_model=JobSendResponse)
async def update_job_send(
    send_id: int,
    body: JobSendUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_send_or_404(db, send_id)
    data = body.model_dump(exclude_unset=True)

    if "delivery_status" in data and data["delivery_status"] not in DELIVERY_STATUS_VALUES:
        raise HTTPException(status_code=422, detail=f"Invalid delivery status. Use: {', '.join(DELIVERY_STATUS_VALUES)}")
    if "employee_response" in data and data["employee_response"] not in EMPLOYEE_RESPONSE_VALUES:
        raise HTTPException(status_code=422, detail=f"Invalid response. Use: {', '.join(EMPLOYEE_RESPONSE_VALUES)}")

    if data.get("delivery_status") == "Sent" and not row.sent_at:
        row.sent_at = datetime.utcnow()
        job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
        if job and job.status in ("New", "Parsed", "Ready for Match", "Matched"):
            job.status = "Sent to Employee"

    if "employee_response" in data and data["employee_response"] != row.employee_response:
        row.response_at = datetime.utcnow()
        job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
        if job and data["employee_response"] == "Interested":
            job.status = "Employee Interested"

    for key, value in data.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    log_audit(db, "job_send.updated", "job_send", row.id, "job_send.updated", principal.user_id)
    return _to_send_response(row, db)
