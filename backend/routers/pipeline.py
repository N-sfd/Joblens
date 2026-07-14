"""Unified Pipeline API — Submission is the pipeline entity.

Mounted at `/api/pipeline` and aliased at `/api/submissions` for backward
compatibility. Combines submissions, interviews, offers, follow-ups, and stage
transitions without a parallel pipeline table.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CRMActivity,
    CRMActivityCreate,
    CRMActivityResponse,
    CRMContact,
    CRMOrganization,
    Employee,
    EmployeeResume,
    INTERVIEW_OUTCOMES,
    INTERVIEW_STATUSES,
    Interview,
    InterviewCreate,
    InterviewResponse,
    JobEmployeeSend,
    JobRequirement,
    OFFER_STATUSES,
    ONBOARDING_STATUSES,
    Offer,
    OfferCreate,
    OfferResponse,
    PipelinePlaceBody,
    PipelineRejectBody,
    PipelineStageUpdate,
    PipelineSummaryCounts,
    PipelineWithdrawBody,
    SUBMISSION_STATUSES,
    Submission,
    SubmissionCreate,
    SubmissionListResponse,
    SubmissionResponse,
    SubmissionUpdate,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from services.audit import log_audit
from services.pipeline_status import (
    CREATE_ALLOWED_STAGES,
    PIPELINE_STAGES,
    STAGE_GROUPS,
    matches_stage_group,
    normalize_pipeline_stage,
    preferred_raw_status,
    raw_statuses_for_stage,
    raw_statuses_matching_group,
    resolve_pipeline_stage,
    stage_order,
    validate_transition,
    _STATUS_DISPLAY_MAP,
)

router = APIRouter()

ORG_WIDE_ROLES = ("admin", "manager", "read_only")

ACTIVE_SUBMISSION_STATUSES = {
    "Draft", "Employee Contacted", "Employee Interested", "Submitted",
    "Client Review", "Interview", "Offer", "Selected",
}

_CREATION_SUBJECTS = frozenset({
    "Pipeline created",
    "Submission created",
    "Created",
})


def _scope_owner(principal: AtsPrincipal) -> str | None:
    if principal.role in ORG_WIDE_ROLES:
        return None
    return principal.user_id


def _apply_scope(query, principal: AtsPrincipal):
    owner = _scope_owner(principal)
    if owner:
        query = query.filter(Submission.created_by == owner)
    return query


def _can_access(row: Submission, principal: AtsPrincipal) -> bool:
    owner = _scope_owner(principal)
    if owner is None:
        return True
    return row.created_by == owner


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


def _status_group_for(display_stage: str) -> str:
    for group in ("placed", "closed", "offer", "interview", "submitted", "pre_submission", "active"):
        if display_stage in STAGE_GROUPS.get(group, frozenset()):
            return group
    return "active"


def _interview_flags(db: Session, submission_id: int) -> tuple[bool, bool]:
    rows = (
        db.query(Interview.status)
        .filter(Interview.submission_id == submission_id)
        .all()
    )
    statuses = {r[0] for r in rows}
    return ("Completed" in statuses), ("Scheduled" in statuses)


def _has_resume(db: Session, employee_id: int) -> bool:
    return (
        db.query(EmployeeResume.id)
        .filter(EmployeeResume.employee_id == employee_id)
        .first()
        is not None
    )


def _match_score_for(db: Session, row: Submission) -> int | None:
    if row.job_employee_send_id:
        send = db.query(JobEmployeeSend).filter(JobEmployeeSend.id == row.job_employee_send_id).first()
        if send and send.match_score_at_send is not None:
            return send.match_score_at_send
    send = (
        db.query(JobEmployeeSend)
        .filter(
            JobEmployeeSend.job_requirement_id == row.job_requirement_id,
            JobEmployeeSend.employee_id == row.employee_id,
            JobEmployeeSend.match_score_at_send.isnot(None),
        )
        .order_by(JobEmployeeSend.created_at.desc())
        .first()
    )
    return send.match_score_at_send if send else None


def _resume_filename(db: Session, employee_id: int) -> str | None:
    primary = (
        db.query(EmployeeResume)
        .filter(EmployeeResume.employee_id == employee_id, EmployeeResume.is_primary.is_(True))
        .first()
    )
    if primary:
        return primary.original_filename or primary.filename
    latest = (
        db.query(EmployeeResume)
        .filter(EmployeeResume.employee_id == employee_id)
        .order_by(EmployeeResume.uploaded_at.desc())
        .first()
    )
    if latest:
        return latest.original_filename or latest.filename
    return None


def _client_name(job: JobRequirement | None, vendor: CRMOrganization | None) -> str | None:
    if not job:
        return vendor.organization_name if vendor else None
    if job.client:
        return job.client
    if job.client_id:
        # Prefer vendor/client org already loaded when available
        pass
    return vendor.organization_name if vendor else (job.vendor if job else None)


def _to_response(row: Submission, db: Session) -> SubmissionResponse:
    """Enrich a Submission row for list/detail responses. Importable by other modules."""
    job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
    emp = db.query(Employee).filter(Employee.id == row.employee_id).first()
    vendor = db.query(CRMOrganization).filter(CRMOrganization.id == row.vendor_id).first() if row.vendor_id else None
    if vendor is None and job and job.client_id:
        vendor = db.query(CRMOrganization).filter(CRMOrganization.id == job.client_id).first()
    recruiter = (
        db.query(CRMContact).filter(CRMContact.id == row.recruiter_contact_id).first()
        if row.recruiter_contact_id else None
    )

    has_completed, has_scheduled = _interview_flags(db, row.id)
    display = resolve_pipeline_stage(
        row.status,
        has_completed_interview=has_completed,
        has_scheduled_interview=has_scheduled,
    )

    next_interview = (
        db.query(Interview)
        .filter(Interview.submission_id == row.id, Interview.status == "Scheduled")
        .order_by(Interview.scheduled_at.asc(), Interview.created_at.desc())
        .first()
    )
    latest_offer = (
        db.query(Offer)
        .filter(Offer.submission_id == row.id)
        .order_by(Offer.created_at.desc())
        .first()
    )
    next_fu = (
        db.query(CRMActivity)
        .filter(
            CRMActivity.submission_id == row.id,
            CRMActivity.status == "Open",
            CRMActivity.due_date.isnot(None),
        )
        .order_by(CRMActivity.due_date.asc())
        .first()
    )
    last_act = (
        db.query(CRMActivity)
        .filter(CRMActivity.submission_id == row.id)
        .order_by(CRMActivity.activity_date.desc())
        .first()
    )
    now = datetime.utcnow()
    follow_up_overdue = bool(next_fu and next_fu.due_date and next_fu.due_date < now)

    client_name = _client_name(job, vendor)
    if job and job.client_id and not job.client:
        client_org = db.query(CRMOrganization).filter(CRMOrganization.id == job.client_id).first()
        if client_org:
            client_name = client_org.organization_name

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
        client_name=client_name,
        status_display=display,
        status_group=_status_group_for(display),
        stage_order=stage_order(display),
        match_score=_match_score_for(db, row),
        resume_filename=_resume_filename(db, row.employee_id),
        next_interview_at=next_interview.scheduled_at if next_interview else None,
        offer_status=latest_offer.status if latest_offer else None,
        next_follow_up_at=next_fu.due_date if next_fu else None,
        follow_up_overdue=follow_up_overdue,
        last_activity_at=last_act.activity_date if last_act else (row.updated_at or row.created_at),
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


def _get_or_404(db: Session, submission_id: int, principal: AtsPrincipal) -> Submission:
    row = db.query(Submission).filter(Submission.id == submission_id).first()
    if not row or not _can_access(row, principal):
        raise HTTPException(status_code=404, detail="Submission not found.")
    return row


def _log_activity(
    db: Session,
    *,
    submission: Submission,
    subject: str,
    description: str | None,
    principal: AtsPrincipal,
    activity_type: str = "Note",
    due_date: datetime | None = None,
    status: str = "Done",
) -> CRMActivity:
    act = CRMActivity(
        activity_type=activity_type,
        subject=subject,
        description=description,
        submission_id=submission.id,
        employee_id=submission.employee_id,
        job_requirement_id=submission.job_requirement_id,
        organization_id=submission.vendor_id,
        contact_id=submission.recruiter_contact_id,
        activity_date=datetime.utcnow(),
        due_date=due_date,
        status=status,
        created_by=principal.user_id,
    )
    db.add(act)
    return act


def _display_for(row: Submission, db: Session) -> str:
    has_completed, has_scheduled = _interview_flags(db, row.id)
    return resolve_pipeline_stage(
        row.status,
        has_completed_interview=has_completed,
        has_scheduled_interview=has_scheduled,
    )


def _resolve_create_raw_status(status: str | None) -> str:
    raw = (status or "Draft").strip()
    if raw in CREATE_ALLOWED_STAGES:
        return preferred_raw_status(raw)
    display = normalize_pipeline_stage(raw)
    if display not in CREATE_ALLOWED_STAGES:
        raise HTTPException(
            status_code=422,
            detail=f"Initial stage must be one of: {', '.join(sorted(CREATE_ALLOWED_STAGES))}.",
        )
    if raw in SUBMISSION_STATUSES:
        return raw
    return preferred_raw_status(display)


def _check_duplicate(db: Session, employee_id: int, job_requirement_id: int) -> None:
    existing = (
        db.query(Submission)
        .filter(
            Submission.employee_id == employee_id,
            Submission.job_requirement_id == job_requirement_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This candidate is already in the pipeline for this job.",
                "submission_id": existing.id,
            },
        )


def _apply_stage_change(
    db: Session,
    row: Submission,
    to_stage: str,
    principal: AtsPrincipal,
    *,
    reason: str | None = None,
    confirmed: bool = False,
    resume_override_reason: str | None = None,
) -> None:
    from_stage = _display_for(row, db)
    err = validate_transition(from_stage, to_stage, reason=reason, confirmed=confirmed)
    if err:
        raise HTTPException(status_code=422, detail=err)

    if to_stage == "Submitted" and not _has_resume(db, row.employee_id):
        if principal.role == "admin" and (resume_override_reason or "").strip():
            reason = (reason or "") + f" [resume override: {resume_override_reason.strip()}]"
        else:
            raise HTTPException(
                status_code=422,
                detail="A resume is required before moving to Submitted. Admins may override with a reason.",
            )

    raw = preferred_raw_status(to_stage)
    # Interview Completed shares raw "Interview" — distinguish via interview rows.
    if to_stage == "Interview Completed":
        raw = "Interview"
    row.status = raw
    job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
    _sync_job_status(job, raw)
    desc = f"{from_stage} → {to_stage}"
    if reason:
        desc = f"{desc}. Reason: {reason}"
    _log_activity(
        db,
        submission=row,
        subject="Stage changed",
        description=desc,
        principal=principal,
        activity_type="Stage Change",
    )


def _interview_to_response(row: Interview, db: Session) -> InterviewResponse:
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


def _offer_to_response(row: Offer, db: Session) -> OfferResponse:
    sub = db.query(Submission).filter(Submission.id == row.submission_id).first()
    job = db.query(JobRequirement).filter(JobRequirement.id == sub.job_requirement_id).first() if sub else None
    emp = db.query(Employee).filter(Employee.id == sub.employee_id).first() if sub else None
    return OfferResponse(
        id=row.id,
        submission_id=row.submission_id,
        offered_rate=row.offered_rate,
        rate_type=row.rate_type,
        start_date=row.start_date,
        offer_date=row.offer_date,
        expiry_date=row.expiry_date,
        status=row.status,
        onboarding_status=row.onboarding_status,
        notes=row.notes,
        job_title=job.job_title if job else None,
        employee_name=_employee_name(emp),
        submission_status=sub.status if sub else None,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


# --- Summary / list / CRUD ---


@router.get("/summary", response_model=PipelineSummaryCounts)
async def pipeline_summary(
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    q = _apply_scope(db.query(Submission), principal)
    rows = q.all()
    counts = PipelineSummaryCounts()
    now = datetime.utcnow()
    for row in rows:
        display = _display_for(row, db)
        if matches_stage_group(display, "active"):
            counts.active += 1
        if matches_stage_group(display, "submitted"):
            counts.submitted += 1
        if matches_stage_group(display, "interview"):
            counts.interview += 1
        if matches_stage_group(display, "offer"):
            counts.offer += 1
        if matches_stage_group(display, "placed"):
            counts.placed += 1

    fu_q = db.query(func.count(CRMActivity.id)).filter(
        CRMActivity.due_date.isnot(None),
        CRMActivity.status == "Open",
        CRMActivity.due_date <= now,
        CRMActivity.submission_id.isnot(None),
    )
    owner = _scope_owner(principal)
    if owner:
        fu_q = fu_q.join(Submission, Submission.id == CRMActivity.submission_id).filter(
            Submission.created_by == owner
        )
    counts.follow_ups_due = fu_q.scalar() or 0
    return counts


@router.get("/")
async def list_pipeline(
    request: Request,
    q: str | None = Query(None, description="Search candidate name or job title"),
    job_requirement_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    status: str | None = Query(None),
    stage: str | None = Query(None),
    stage_group: str | None = Query(None),
    active_only: bool = Query(False),
    created_by: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    limit: int | None = Query(None, ge=1, le=200, description="Legacy: return bare list"),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    query = _apply_scope(db.query(Submission), principal)
    if job_requirement_id is not None:
        query = query.filter(Submission.job_requirement_id == job_requirement_id)
    if employee_id is not None:
        query = query.filter(Submission.employee_id == employee_id)
    if status:
        query = query.filter(Submission.status == status)
    if active_only:
        query = query.filter(Submission.status.in_(ACTIVE_SUBMISSION_STATUSES))
    if created_by:
        query = query.filter(Submission.created_by == created_by)

    if stage_group:
        known, includes_unmapped = raw_statuses_matching_group(stage_group)
        if includes_unmapped:
            all_known = set(_STATUS_DISPLAY_MAP.keys())
            query = query.filter(
                or_(Submission.status.in_(list(known)), ~Submission.status.in_(list(all_known)))
            )
        elif known:
            query = query.filter(Submission.status.in_(list(known)))
        else:
            query = query.filter(False)

    if stage:
        stage_norm = stage.strip().replace("_", " ")
        matched = None
        slug = stage.strip().lower().replace(" ", "_")
        for s in PIPELINE_STAGES:
            if s.lower().replace(" ", "_") == slug or s.lower() == stage_norm.lower():
                matched = s
                break
        if matched is None:
            matched = " ".join(p.capitalize() if p.islower() else p for p in stage_norm.split())
        known = raw_statuses_for_stage(matched)
        if known:
            query = query.filter(Submission.status.in_(list(known)))

    if q:
        term = f"%{q.strip()}%"
        query = (
            query.join(Employee, Employee.id == Submission.employee_id)
            .join(JobRequirement, JobRequirement.id == Submission.job_requirement_id)
            .filter(
                or_(
                    Employee.name.ilike(term),
                    Employee.first_name.ilike(term),
                    Employee.last_name.ilike(term),
                    Employee.email.ilike(term),
                    JobRequirement.job_title.ilike(term),
                )
            )
        )

    query = query.order_by(Submission.updated_at.desc())

    legacy = "limit" in request.query_params and limit is not None
    if legacy:
        rows = query.limit(limit).all()
        return [_to_response(r, db) for r in rows]

    total = query.count()
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    # Post-filter interview stages when resolve differs by Interview rows
    if stage:
        slug = stage.strip().lower().replace(" ", "_")
        if slug in ("interview_scheduled", "interview_completed") or stage.lower() in (
            "interview scheduled", "interview completed",
        ):
            wanted = "Interview Scheduled" if "scheduled" in slug or "scheduled" in stage.lower() else "Interview Completed"
            rows = [r for r in rows if _display_for(r, db) == wanted]
            # Recompute total roughly for this page-window; for accuracy re-filter all
            all_ids = query.all()
            filtered = [r for r in all_ids if _display_for(r, db) == wanted]
            total = len(filtered)
            total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
            rows = filtered[(page - 1) * page_size: page * page_size]

    return SubmissionListResponse(
        items=[_to_response(r, db) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{submission_id}", response_model=SubmissionResponse)
async def get_pipeline_item(
    submission_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    return _to_response(_get_or_404(db, submission_id, principal), db)


@router.post("/", response_model=SubmissionResponse, status_code=201)
async def create_pipeline_item(
    body: SubmissionCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    job = db.query(JobRequirement).filter(JobRequirement.id == body.job_requirement_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job requirement not found.")
    emp = db.query(Employee).filter(Employee.id == body.employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found.")

    _check_duplicate(db, body.employee_id, body.job_requirement_id)

    raw_status = _resolve_create_raw_status(body.status)
    if normalize_pipeline_stage(raw_status) == "Submitted" and not _has_resume(db, body.employee_id):
        if principal.role != "admin":
            raise HTTPException(
                status_code=422,
                detail="A resume is required when creating at Submitted stage.",
            )

    data = body.model_dump()
    data["status"] = raw_status
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
    db.flush()
    _log_activity(
        db,
        submission=row,
        subject="Pipeline created",
        description=f"Pipeline record created at {normalize_pipeline_stage(row.status)}",
        principal=principal,
        activity_type="Note",
    )
    db.commit()
    db.refresh(row)
    log_audit(db, "submission.created", "submission", row.id, "pipeline.created", principal.user_id)
    return _to_response(row, db)


@router.post("/from-job-send/{send_id}", response_model=SubmissionResponse, status_code=201)
async def create_from_job_send(
    send_id: int,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    send = db.query(JobEmployeeSend).filter(JobEmployeeSend.id == send_id).first()
    if not send:
        raise HTTPException(status_code=404, detail="Job send not found.")
    existing_send = db.query(Submission).filter(Submission.job_employee_send_id == send_id).first()
    if existing_send:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This candidate is already in the pipeline for this job.",
                "submission_id": existing_send.id,
            },
        )
    _check_duplicate(db, send.employee_id, send.job_requirement_id)

    job = db.query(JobRequirement).filter(JobRequirement.id == send.job_requirement_id).first()
    emp = db.query(Employee).filter(Employee.id == send.employee_id).first()
    if not job or not emp:
        raise HTTPException(status_code=404, detail="Linked job or employee not found.")

    status = preferred_raw_status("Interested") if send.employee_response == "Interested" else preferred_raw_status("Identified")
    row = Submission(
        job_requirement_id=send.job_requirement_id,
        employee_id=send.employee_id,
        job_employee_send_id=send.id,
        recruiter_contact_id=job.recruiter_contact_id,
        vendor_id=job.vendor_id,
        submitted_rate=emp.expected_rate,
        submission_date=datetime.utcnow(),
        status=status,
        notes=(
            f"Created from job send (match {send.match_score_at_send}%)"
            if send.match_score_at_send is not None
            else "Created from job send"
        ),
        created_by=principal.user_id,
    )
    db.add(row)
    _sync_job_status(job, status)
    db.flush()
    _log_activity(
        db,
        submission=row,
        subject="Pipeline created",
        description="Created from job send",
        principal=principal,
    )
    db.commit()
    db.refresh(row)
    log_audit(db, "submission.created", "submission", row.id, "pipeline.from_job_send", principal.user_id)
    return _to_response(row, db)


def _update_submission_fields(
    row: Submission,
    data: dict,
    principal: AtsPrincipal,
    db: Session,
) -> SubmissionResponse:
    if "status" in data and data["status"] is not None:
        raw = data["status"]
        if raw in PIPELINE_STAGES:
            _apply_stage_change(db, row, raw, principal, reason=None, confirmed=True)
            data = {k: v for k, v in data.items() if k != "status"}
        elif raw not in SUBMISSION_STATUSES:
            raise HTTPException(status_code=422, detail=f"Invalid status. Use: {', '.join(SUBMISSION_STATUSES)}")

    for key, value in data.items():
        setattr(row, key, value)
    job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
    if "status" in data:
        _sync_job_status(job, row.status)
    db.commit()
    db.refresh(row)
    log_audit(db, "submission.updated", "submission", row.id, "pipeline.updated", principal.user_id)
    return _to_response(row, db)


@router.put("/{submission_id}", response_model=SubmissionResponse)
async def put_pipeline_item(
    submission_id: int,
    body: SubmissionUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id, principal)
    return _update_submission_fields(row, body.model_dump(exclude_unset=True), principal, db)


@router.patch("/{submission_id}", response_model=SubmissionResponse)
async def patch_pipeline_item(
    submission_id: int,
    body: SubmissionUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id, principal)
    return _update_submission_fields(row, body.model_dump(exclude_unset=True), principal, db)


@router.patch("/{submission_id}/stage", response_model=SubmissionResponse)
async def update_pipeline_stage(
    submission_id: int,
    body: PipelineStageUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id, principal)
    to_stage = body.stage.strip()
    slug = to_stage.lower().replace(" ", "_")
    for s in PIPELINE_STAGES:
        if s.lower().replace(" ", "_") == slug:
            to_stage = s
            break
    _apply_stage_change(
        db,
        row,
        to_stage,
        principal,
        reason=body.reason,
        confirmed=body.confirmed,
        resume_override_reason=body.resume_override_reason,
    )
    db.commit()
    db.refresh(row)
    log_audit(db, "submission.stage", "submission", row.id, f"stage→{to_stage}", principal.user_id)
    return _to_response(row, db)


# --- Activities / follow-ups ---


@router.get("/{submission_id}/activities", response_model=list[CRMActivityResponse])
async def list_pipeline_activities(
    submission_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_or_404(db, submission_id, principal)
    return (
        db.query(CRMActivity)
        .filter(CRMActivity.submission_id == submission_id)
        .order_by(CRMActivity.activity_date.desc())
        .all()
    )


@router.post("/{submission_id}/follow-ups", response_model=CRMActivityResponse, status_code=201)
async def create_follow_up(
    submission_id: int,
    body: CRMActivityCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id, principal)
    subject = (body.subject or "").strip() or "Follow-up"
    dup = (
        db.query(CRMActivity)
        .filter(
            CRMActivity.submission_id == submission_id,
            CRMActivity.status == "Open",
            CRMActivity.subject == subject,
        )
        .first()
    )
    if dup:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "An open follow-up with this subject already exists.",
                "activity_id": dup.id,
            },
        )
    data = body.model_dump()
    data["subject"] = subject
    data["activity_type"] = data.get("activity_type") or "Follow-Up"
    data["status"] = data.get("status") or "Open"
    data["submission_id"] = submission_id
    data["employee_id"] = data.get("employee_id") or row.employee_id
    data["job_requirement_id"] = data.get("job_requirement_id") or row.job_requirement_id
    data["created_by"] = principal.user_id
    act = CRMActivity(**data)
    if not act.activity_date:
        act.activity_date = datetime.utcnow()
    db.add(act)
    db.commit()
    db.refresh(act)
    log_audit(db, "followup.created", "activity", act.id, subject, principal.user_id)
    return act


# --- Interviews ---


@router.get("/{submission_id}/interviews", response_model=list[InterviewResponse])
async def list_pipeline_interviews(
    submission_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_or_404(db, submission_id, principal)
    rows = (
        db.query(Interview)
        .filter(Interview.submission_id == submission_id)
        .order_by(Interview.scheduled_at.desc(), Interview.created_at.desc())
        .all()
    )
    return [_interview_to_response(r, db) for r in rows]


@router.post("/{submission_id}/interviews", response_model=InterviewResponse, status_code=201)
async def create_pipeline_interview(
    submission_id: int,
    body: InterviewCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id, principal)
    if body.status not in INTERVIEW_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Use: {', '.join(INTERVIEW_STATUSES)}")
    if body.outcome not in INTERVIEW_OUTCOMES:
        raise HTTPException(status_code=422, detail=f"Invalid outcome. Use: {', '.join(INTERVIEW_OUTCOMES)}")

    data = body.model_dump()
    data["submission_id"] = submission_id
    data["created_by"] = principal.user_id
    interview = Interview(**data)
    db.add(interview)

    display = _display_for(row, db)
    if display not in ("Rejected", "Withdrawn", "Placed", "Offer") and display != "Interview Scheduled":
        if validate_transition(display, "Interview Scheduled") is None or display in (
            "Submitted", "Client Review", "Interview Completed", "Interested", "Contacted", "Identified",
        ):
            row.status = preferred_raw_status("Interview Scheduled")
            job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
            _sync_job_status(job, row.status)

    _log_activity(
        db,
        submission=row,
        subject="Interview scheduled",
        description=f"Interview ({interview.interview_type or 'general'}) scheduled",
        principal=principal,
        activity_type="Interview",
    )
    db.commit()
    db.refresh(interview)
    log_audit(db, "interview.created", "interview", interview.id, "pipeline.interview", principal.user_id)
    return _interview_to_response(interview, db)


# --- Offer ---


@router.get("/{submission_id}/offer", response_model=OfferResponse | None)
async def get_pipeline_offer(
    submission_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_or_404(db, submission_id, principal)
    offer = (
        db.query(Offer)
        .filter(Offer.submission_id == submission_id)
        .order_by(Offer.created_at.desc())
        .first()
    )
    if not offer:
        return None
    return _offer_to_response(offer, db)


@router.post("/{submission_id}/offer", response_model=OfferResponse, status_code=201)
async def create_pipeline_offer(
    submission_id: int,
    body: OfferCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id, principal)
    if body.status not in OFFER_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Use: {', '.join(OFFER_STATUSES)}")
    if body.onboarding_status not in ONBOARDING_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid onboarding status. Use: {', '.join(ONBOARDING_STATUSES)}")

    data = body.model_dump()
    data["submission_id"] = submission_id
    if not data.get("offer_date"):
        data["offer_date"] = datetime.utcnow()
    if not data.get("offered_rate"):
        data["offered_rate"] = row.submitted_rate
    data["created_by"] = principal.user_id
    offer = Offer(**data)
    db.add(offer)

    display = _display_for(row, db)
    if display not in ("Rejected", "Withdrawn", "Placed"):
        row.status = preferred_raw_status("Offer")
        job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
        _sync_job_status(job, row.status)

    _log_activity(
        db,
        submission=row,
        subject="Offer created",
        description=f"Offer ({offer.status}) recorded",
        principal=principal,
        activity_type="Offer",
    )
    db.commit()
    db.refresh(offer)
    log_audit(db, "offer.created", "offer", offer.id, "pipeline.offer", principal.user_id)
    return _offer_to_response(offer, db)


# --- Place / reject / withdraw / delete ---


@router.post("/{submission_id}/place", response_model=SubmissionResponse)
async def place_candidate(
    submission_id: int,
    body: PipelinePlaceBody,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id, principal)
    if not body.confirmed:
        raise HTTPException(status_code=422, detail="Placement requires confirmation.")

    accepted = (
        db.query(Offer)
        .filter(Offer.submission_id == submission_id, Offer.status == "Accepted")
        .first()
    )
    if body.offer_id:
        accepted = db.query(Offer).filter(Offer.id == body.offer_id, Offer.submission_id == submission_id).first()
        if not accepted or accepted.status != "Accepted":
            if principal.role != "admin" or not (body.override_reason or "").strip():
                raise HTTPException(status_code=422, detail="Offer must be Accepted, or admin must supply override_reason.")
    elif not accepted:
        if principal.role != "admin" or not (body.override_reason or "").strip():
            raise HTTPException(
                status_code=422,
                detail="An accepted offer is required to place, or an admin override_reason.",
            )

    reason = body.override_reason
    _apply_stage_change(db, row, "Placed", principal, reason=reason, confirmed=True)

    if body.final_rate:
        row.submitted_rate = body.final_rate
    emp = db.query(Employee).filter(Employee.id == row.employee_id).first()
    if emp:
        emp.status = "Placed"
    job = db.query(JobRequirement).filter(JobRequirement.id == row.job_requirement_id).first()
    if job and body.fill_job:
        job.status = "Selected"

    _log_activity(
        db,
        submission=row,
        subject="Candidate placed",
        description=f"Placed" + (f" (start {body.start_date})" if body.start_date else ""),
        principal=principal,
        activity_type="Placement",
    )
    db.commit()
    db.refresh(row)
    log_audit(db, "submission.placed", "submission", row.id, "pipeline.placed", principal.user_id)
    return _to_response(row, db)


@router.post("/{submission_id}/reject", response_model=SubmissionResponse)
async def reject_candidate(
    submission_id: int,
    body: PipelineRejectBody,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id, principal)
    if not (body.reason or "").strip():
        raise HTTPException(status_code=422, detail="A rejection reason is required.")
    reason = body.reason.strip()
    if body.notes:
        reason = f"{reason}. {body.notes.strip()}"
    _apply_stage_change(db, row, "Rejected", principal, reason=reason, confirmed=True)
    _log_activity(
        db,
        submission=row,
        subject="Candidate rejected",
        description=reason,
        principal=principal,
        activity_type="Rejection",
    )
    db.commit()
    db.refresh(row)
    log_audit(db, "submission.rejected", "submission", row.id, "pipeline.rejected", principal.user_id)
    return _to_response(row, db)


@router.post("/{submission_id}/withdraw", response_model=SubmissionResponse)
async def withdraw_candidate(
    submission_id: int,
    body: PipelineWithdrawBody,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id, principal)
    if not (body.reason or "").strip():
        raise HTTPException(status_code=422, detail="A withdrawal reason is required.")
    reason = body.reason.strip()
    if body.notes:
        reason = f"{reason}. {body.notes.strip()}"
    if body.effective_date:
        reason = f"{reason} (effective {body.effective_date.date()})"
    _apply_stage_change(db, row, "Withdrawn", principal, reason=reason, confirmed=True)
    _log_activity(
        db,
        submission=row,
        subject="Candidate withdrawn",
        description=reason,
        principal=principal,
        activity_type="Withdrawal",
    )
    db.commit()
    db.refresh(row)
    log_audit(db, "submission.withdrawn", "submission", row.id, "pipeline.withdrawn", principal.user_id)
    return _to_response(row, db)


@router.delete("/{submission_id}")
async def delete_pipeline_item(
    submission_id: int,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, submission_id, principal)
    display = _display_for(row, db)
    if display != "Identified":
        raise HTTPException(
            status_code=409,
            detail="Only Identified pipeline records without history can be deleted. Reject or withdraw instead.",
        )
    if db.query(Interview.id).filter(Interview.submission_id == submission_id).first():
        raise HTTPException(status_code=409, detail="Cannot delete: interview records exist.")
    if db.query(Offer.id).filter(Offer.submission_id == submission_id).first():
        raise HTTPException(status_code=409, detail="Cannot delete: offer records exist.")
    acts = db.query(CRMActivity).filter(CRMActivity.submission_id == submission_id).all()
    non_creation = [a for a in acts if (a.subject or "") not in _CREATION_SUBJECTS]
    if non_creation:
        raise HTTPException(status_code=409, detail="Cannot delete: extra activity history exists.")

    for a in acts:
        db.delete(a)
    db.delete(row)
    db.commit()
    log_audit(db, "submission.deleted", "submission", submission_id, "pipeline.deleted", principal.user_id)
    return {"message": "Pipeline record deleted."}
