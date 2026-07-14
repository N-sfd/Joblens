"""Unified Candidates module API — reuses the Employee model as the candidate entity.

Mounted at both `/api/employees` (backward-compatible) and `/api/candidates`.
Does not introduce a parallel Candidate table.
"""

from __future__ import annotations

import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CRMActivity,
    CandidateCounts,
    CandidateDuplicateCheckResponse,
    CandidateDuplicateMatch,
    Employee,
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeeListItem,
    EmployeeListResponse,
    EmployeeStatusUpdate,
    EmployeeResume,
    Interview,
    JobEmployeeSend,
    JobRequirement,
    Offer,
    Submission,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from routers.employee_resumes import _read_and_validate, _extract_text
from services.audit import log_audit
from services.claude_service import parse_employee_resume
from services.rate_limit import rate_limit_ai
from services.ai_errors import raise_clean_ai_error
from services.candidate_status import (
    normalize_candidate_status,
    normalize_email,
    normalize_phone,
    raw_statuses_matching_group,
)
from services.job_employee_match import match_employees_to_job
from services.job_status import raw_statuses_matching_group as job_raw_statuses_matching_group

logger = logging.getLogger(__name__)

router = APIRouter()

ORG_WIDE_ROLES = ("admin", "manager", "read_only")
ARCHIVED_STATUSES = {"Inactive", "Former Employee", "Do Not Contact"}
ACTIVE_SUBMISSION_STATUSES = {
    "Draft", "Employee Contacted", "Employee Interested", "Submitted",
    "Client Review", "Interview", "Offer",
}
PLACEMENT_SUBMISSION_STATUSES = {"Selected"}


def _scope_owner(principal: AtsPrincipal) -> str | None:
    if principal.role in ORG_WIDE_ROLES:
        return None
    return principal.user_id


def _apply_scope(query, principal: AtsPrincipal):
    owner = _scope_owner(principal)
    if owner:
        query = query.filter(Employee.created_by == owner)
    return query


def _can_access(employee: Employee, principal: AtsPrincipal) -> bool:
    owner = _scope_owner(principal)
    if owner is None:
        return True
    return employee.created_by == owner


def _get_employee_or_404(db: Session, employee_id: int, principal: AtsPrincipal) -> Employee:
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    if not _can_access(employee, principal):
        raise HTTPException(status_code=403, detail="You do not have access to this candidate.")
    return employee


def _to_response(employee: Employee) -> EmployeeResponse:
    data = EmployeeResponse.model_validate(employee).model_dump()
    data["status_display"] = normalize_candidate_status(employee.status)
    return EmployeeResponse(**data)


def _resume_summary(db: Session, employee_ids: list[int]) -> dict[int, tuple[int, str, bool]]:
    if not employee_ids:
        return {}
    counts = dict(
        db.query(EmployeeResume.employee_id, func.count(EmployeeResume.id))
        .filter(EmployeeResume.employee_id.in_(employee_ids))
        .group_by(EmployeeResume.employee_id)
        .all()
    )
    primaries = {
        r.employee_id: r
        for r in db.query(EmployeeResume)
        .filter(EmployeeResume.employee_id.in_(employee_ids), EmployeeResume.is_primary.is_(True))
        .all()
    }
    latest: dict[int, EmployeeResume] = {}
    for r in (
        db.query(EmployeeResume)
        .filter(EmployeeResume.employee_id.in_(employee_ids))
        .order_by(EmployeeResume.uploaded_at.desc())
        .all()
    ):
        latest.setdefault(r.employee_id, r)

    out: dict[int, tuple[int, str, bool]] = {}
    for eid in employee_ids:
        count = counts.get(eid, 0)
        if count == 0:
            out[eid] = (0, "None", False)
            continue
        ref = primaries.get(eid) or latest.get(eid)
        has_primary = eid in primaries
        if ref and ref.parsing_status == "failed":
            status = "Failed"
        elif ref:
            status = "Parsed"
        else:
            status = "None"
        out[eid] = (count, status, has_primary)
    return out


def _related_counts(db: Session, employee_ids: list[int]) -> dict[int, dict[str, int | datetime | None]]:
    """Aggregate match/submission/interview/offer counts + last activity."""
    empty = {
        "match_count": 0, "submission_count": 0, "interview_count": 0,
        "offer_count": 0, "last_activity_at": None,
    }
    if not employee_ids:
        return {}

    send_counts = dict(
        db.query(JobEmployeeSend.employee_id, func.count(JobEmployeeSend.id))
        .filter(JobEmployeeSend.employee_id.in_(employee_ids))
        .group_by(JobEmployeeSend.employee_id)
        .all()
    )
    sub_counts = dict(
        db.query(Submission.employee_id, func.count(Submission.id))
        .filter(Submission.employee_id.in_(employee_ids))
        .group_by(Submission.employee_id)
        .all()
    )
    interview_rows = (
        db.query(Submission.employee_id, func.count(Interview.id))
        .join(Interview, Interview.submission_id == Submission.id)
        .filter(Submission.employee_id.in_(employee_ids))
        .group_by(Submission.employee_id)
        .all()
    )
    interview_counts = dict(interview_rows)
    offer_rows = (
        db.query(Submission.employee_id, func.count(Offer.id))
        .join(Offer, Offer.submission_id == Submission.id)
        .filter(Submission.employee_id.in_(employee_ids))
        .group_by(Submission.employee_id)
        .all()
    )
    offer_counts = dict(offer_rows)

    activity_max = dict(
        db.query(CRMActivity.employee_id, func.max(CRMActivity.activity_date))
        .filter(CRMActivity.employee_id.in_(employee_ids))
        .group_by(CRMActivity.employee_id)
        .all()
    )
    updated = {
        e.id: e.updated_at
        for e in db.query(Employee.id, Employee.updated_at).filter(Employee.id.in_(employee_ids)).all()
    }

    out: dict[int, dict[str, int | datetime | None]] = {}
    for eid in employee_ids:
        last_act = activity_max.get(eid)
        last_upd = updated.get(eid)
        last = max([d for d in (last_act, last_upd) if d is not None], default=None)
        out[eid] = {
            "match_count": int(send_counts.get(eid, 0)),
            "submission_count": int(sub_counts.get(eid, 0)),
            "interview_count": int(interview_counts.get(eid, 0)),
            "offer_count": int(offer_counts.get(eid, 0)),
            "last_activity_at": last,
        }
    return out


def _to_list_item(
    employee: Employee,
    resume: tuple[int, str, bool],
    related: dict[str, int | datetime | None],
) -> EmployeeListItem:
    base = _to_response(employee).model_dump()
    # Never include resume text / notes blob spam on list — notes stay but are small.
    return EmployeeListItem(
        **base,
        resume_count=resume[0],
        resume_status=resume[1],
        has_primary_resume=resume[2],
        match_count=int(related.get("match_count") or 0),
        submission_count=int(related.get("submission_count") or 0),
        interview_count=int(related.get("interview_count") or 0),
        offer_count=int(related.get("offer_count") or 0),
        last_activity_at=related.get("last_activity_at"),  # type: ignore[arg-type]
    )


def find_duplicate_matches(
    db: Session,
    *,
    email: str | None = None,
    phone: str | None = None,
    name: str | None = None,
    exclude_id: int | None = None,
) -> list[CandidateDuplicateMatch]:
    matches: list[CandidateDuplicateMatch] = []
    seen: set[int] = set()

    def _add(row: Employee, reason: str):
        if exclude_id and row.id == exclude_id:
            return
        if row.id in seen:
            return
        seen.add(row.id)
        matches.append(CandidateDuplicateMatch(
            id=row.id,
            name=row.name,
            email=row.email,
            phone=row.phone,
            status=row.status or "Active",
            status_display=normalize_candidate_status(row.status),
            match_reason=reason,
        ))

    em = normalize_email(email)
    if em:
        for row in db.query(Employee).filter(
            or_(
                func.lower(Employee.email) == em,
                func.lower(Employee.personal_email) == em,
                func.lower(Employee.company_email) == em,
            )
        ).limit(10).all():
            _add(row, "email")

    ph = normalize_phone(phone)
    if ph and len(ph) >= 7:
        # Compare digit-normalized phones in Python (SQLite/Postgres digit strip varies).
        candidates = db.query(Employee).filter(
            or_(Employee.phone.isnot(None), Employee.alternate_phone.isnot(None))
        ).limit(500).all()
        for row in candidates:
            if normalize_phone(row.phone) == ph or normalize_phone(row.alternate_phone) == ph:
                _add(row, "phone")

    nm = (name or "").strip().lower()
    if nm and len(nm) >= 3 and (em or ph):
        # name + email/phone fragment already covered above; name + same last token soft match
        parts = [p for p in nm.replace(",", " ").split() if p]
        if parts:
            last = parts[-1]
            for row in db.query(Employee).filter(
                or_(
                    func.lower(Employee.name).like(f"%{last}%"),
                    func.lower(Employee.last_name) == last,
                )
            ).limit(20).all():
                if exclude_id and row.id == exclude_id:
                    continue
                if row.id in seen:
                    continue
                # Soft: require shared email domain fragment or phone last-4
                soft = False
                if em and "@" in em and row.email and em.split("@")[-1] in (row.email or "").lower():
                    soft = True
                if ph and len(ph) >= 4 and (
                    normalize_phone(row.phone).endswith(ph[-4:])
                    or normalize_phone(row.alternate_phone).endswith(ph[-4:])
                ):
                    soft = True
                if soft:
                    _add(row, "name_email" if em else "name_phone")

    return matches


@router.post("/check-duplicates", response_model=CandidateDuplicateCheckResponse)
async def check_duplicates(
    body: dict,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    matches = find_duplicate_matches(
        db,
        email=body.get("email"),
        phone=body.get("phone"),
        name=body.get("name") or body.get("full_name"),
        exclude_id=body.get("exclude_id"),
    )
    blocked = any(m.match_reason in ("email", "phone") for m in matches)
    return CandidateDuplicateCheckResponse(matches=matches, blocked=blocked)


@router.post("/", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    body: EmployeeCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
    force_new: bool = Query(False, description="Admin-only: continue as new despite email/phone duplicate"),
):
    matches = find_duplicate_matches(db, email=body.email, phone=body.phone, name=body.name)
    hard = [m for m in matches if m.match_reason in ("email", "phone")]
    if hard and not (force_new and principal.role == "admin"):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "A possible existing candidate was found.",
                "matches": [m.model_dump() for m in hard],
            },
        )
    data = body.model_dump()
    if principal.user_id:
        data["created_by"] = principal.user_id
    employee = Employee(**data)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    log_audit(db, "employee.created", "employee", employee.id, f"Created candidate {employee.name}", principal.user_id)
    db.add(CRMActivity(
        activity_type="Note",
        subject="Candidate created",
        description=f"Candidate {employee.name} created",
        employee_id=employee.id,
        activity_date=datetime.utcnow(),
        created_by=principal.user_id,
    ))
    db.commit()
    return _to_response(employee)


@router.get("/", response_model=EmployeeListResponse)
async def list_employees(
    q: str | None = Query(None, description="Search name, email, phone, title, skills, location"),
    email: str | None = Query(None),
    phone: str | None = Query(None),
    current_title: str | None = Query(None),
    skills: str | None = Query(None),
    status: str | None = Query(None),
    status_group: str | None = Query(None, description="active | Inactive | New | …"),
    availability: str | None = Query(None),
    work_authorization: str | None = Query(None),
    visa_status: str | None = Query(None),
    primary_skill: str | None = Query(None),
    location: str | None = Query(None),
    employment_type: str | None = Query(None),
    source: str | None = Query(None),
    created_by: str | None = Query(None),
    has_resume: bool | None = Query(None),
    has_matches: bool | None = Query(None),
    has_submissions: bool | None = Query(None),
    archived: bool | None = Query(None, description="True=archived only, False=active only"),
    created_from: datetime | None = Query(None),
    created_to: datetime | None = Query(None),
    sort: str | None = Query("last_activity", description="last_activity|newest|name|title|experience|matches|submissions|availability"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    query = _apply_scope(db.query(Employee), principal)

    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(
            Employee.name.ilike(term),
            Employee.first_name.ilike(term),
            Employee.last_name.ilike(term),
            Employee.email.ilike(term),
            Employee.personal_email.ilike(term),
            Employee.phone.ilike(term),
            Employee.primary_skill.ilike(term),
            Employee.secondary_skills.ilike(term),
            Employee.current_job_title.ilike(term),
            Employee.current_location.ilike(term),
            Employee.location.ilike(term),
        ))
    if email:
        query = query.filter(or_(
            Employee.email.ilike(f"%{email.strip()}%"),
            Employee.personal_email.ilike(f"%{email.strip()}%"),
        ))
    if phone:
        digits = normalize_phone(phone)
        if digits:
            # Loose contains on raw phone fields
            query = query.filter(or_(
                Employee.phone.ilike(f"%{phone.strip()}%"),
                Employee.alternate_phone.ilike(f"%{phone.strip()}%"),
            ))
    if current_title:
        query = query.filter(Employee.current_job_title.ilike(f"%{current_title.strip()}%"))
    if skills or primary_skill:
        skill = (skills or primary_skill or "").strip()
        query = query.filter(or_(
            Employee.primary_skill.ilike(f"%{skill}%"),
            Employee.secondary_skills.ilike(f"%{skill}%"),
        ))
    if status:
        query = query.filter(Employee.status == status)
    if status_group:
        known, includes_unmapped = raw_statuses_matching_group(status_group)
        from services.candidate_status import _STATUS_DISPLAY_MAP
        all_known = set(_STATUS_DISPLAY_MAP.keys())
        if includes_unmapped:
            query = query.filter(or_(
                Employee.status.in_(list(known)),
                ~Employee.status.in_(list(all_known)),
                Employee.status.is_(None),
            ))
        else:
            query = query.filter(Employee.status.in_(list(known)))
    if availability:
        query = query.filter(Employee.availability == availability)
    if work_authorization:
        query = query.filter(Employee.work_authorization.ilike(f"%{work_authorization.strip()}%"))
    if visa_status:
        query = query.filter(Employee.visa_status.ilike(f"%{visa_status.strip()}%"))
    if location:
        query = query.filter(or_(
            Employee.current_location.ilike(f"%{location.strip()}%"),
            Employee.location.ilike(f"%{location.strip()}%"),
            Employee.city.ilike(f"%{location.strip()}%"),
        ))
    if employment_type:
        query = query.filter(Employee.employment_type == employment_type)
    if source:
        query = query.filter(Employee.source.ilike(f"%{source.strip()}%"))
    if created_by:
        query = query.filter(Employee.created_by == created_by)
    if created_from:
        query = query.filter(Employee.created_at >= created_from)
    if created_to:
        query = query.filter(Employee.created_at <= created_to)

    if archived is True:
        query = query.filter(Employee.status.in_(ARCHIVED_STATUSES))
    elif archived is False:
        query = query.filter(~Employee.status.in_(ARCHIVED_STATUSES))

    resume_exists = exists().where(EmployeeResume.employee_id == Employee.id)
    if has_resume is True:
        query = query.filter(resume_exists)
    elif has_resume is False:
        query = query.filter(~resume_exists)

    match_exists = exists().where(JobEmployeeSend.employee_id == Employee.id)
    if has_matches is True:
        query = query.filter(match_exists)
    elif has_matches is False:
        query = query.filter(~match_exists)

    sub_exists = exists().where(Submission.employee_id == Employee.id)
    if has_submissions is True:
        query = query.filter(sub_exists)
    elif has_submissions is False:
        query = query.filter(~sub_exists)

    sort_key = (sort or "last_activity").lower()
    # SQLite (tests) does not support nullslast — keep simple ordering.
    if sort_key == "name":
        query = query.order_by(Employee.name.asc())
    elif sort_key == "title":
        query = query.order_by(Employee.current_job_title.asc(), Employee.name.asc())
    elif sort_key == "newest":
        query = query.order_by(Employee.created_at.desc())
    elif sort_key == "experience":
        query = query.order_by(Employee.total_experience.desc())
    elif sort_key == "availability":
        query = query.order_by(Employee.availability.asc())
    else:
        # last_activity / matches / submissions — default updated_at then refine in memory for page
        query = query.order_by(Employee.updated_at.desc())

    total = query.count()
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    employees = (
        query.offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    ids = [e.id for e in employees]
    resume_map = _resume_summary(db, ids)
    related_map = _related_counts(db, ids)
    items = [
        _to_list_item(e, resume_map.get(e.id, (0, "None", False)), related_map.get(e.id, {}))
        for e in employees
    ]

    if sort_key == "matches":
        items.sort(key=lambda x: x.match_count, reverse=True)
    elif sort_key == "submissions":
        items.sort(key=lambda x: x.submission_count, reverse=True)
    elif sort_key == "last_activity":
        items.sort(key=lambda x: x.last_activity_at or x.updated_at, reverse=True)

    return EmployeeListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.post("/parse-resume")
async def parse_resume_for_employee(
    request: Request,
    file: UploadFile = File(...),
    principal: AtsPrincipal = Depends(require_writer),
):
    """Parse a resume file without creating a candidate (review-before-save flow)."""
    rate_limit_ai(request, principal.user_id)
    filename, content = await _read_and_validate(file)
    try:
        resume_text = _extract_text(filename, content)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read this file. It may be corrupted or password-protected.")
    if len(resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Could not extract readable text from the resume.")
    try:
        return await parse_employee_resume(resume_text)
    except Exception as e:
        raise_clean_ai_error(logger, "Resume parsing", e)


@router.get("/{employee_id}", response_model=EmployeeResponse)
async def get_employee(
    employee_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    return _to_response(_get_employee_or_404(db, employee_id, principal))


@router.get("/{employee_id}/counts", response_model=CandidateCounts)
async def get_candidate_counts(
    employee_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_employee_or_404(db, employee_id, principal)
    resumes = db.query(func.count(EmployeeResume.id)).filter(EmployeeResume.employee_id == employee_id).scalar() or 0
    matches = db.query(func.count(JobEmployeeSend.id)).filter(JobEmployeeSend.employee_id == employee_id).scalar() or 0
    active_subs = (
        db.query(func.count(Submission.id))
        .filter(Submission.employee_id == employee_id, Submission.status.in_(ACTIVE_SUBMISSION_STATUSES))
        .scalar() or 0
    )
    placements = (
        db.query(func.count(Submission.id))
        .filter(Submission.employee_id == employee_id, Submission.status.in_(PLACEMENT_SUBMISSION_STATUSES))
        .scalar() or 0
    )
    interviews = (
        db.query(func.count(Interview.id))
        .join(Submission, Submission.id == Interview.submission_id)
        .filter(Submission.employee_id == employee_id)
        .scalar() or 0
    )
    offers = (
        db.query(func.count(Offer.id))
        .join(Submission, Submission.id == Offer.submission_id)
        .filter(Submission.employee_id == employee_id)
        .scalar() or 0
    )
    follow_ups = (
        db.query(func.count(CRMActivity.id))
        .filter(
            CRMActivity.employee_id == employee_id,
            CRMActivity.activity_type == "Follow-Up",
            or_(CRMActivity.status == "Open", CRMActivity.status.is_(None)),
        )
        .scalar() or 0
    )
    return CandidateCounts(
        resumes=int(resumes),
        matches=int(matches),
        active_submissions=int(active_subs),
        interviews=int(interviews),
        offers=int(offers),
        placements=int(placements),
        open_follow_ups=int(follow_ups),
    )


@router.get("/{employee_id}/submissions")
async def get_candidate_submissions(
    employee_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_employee_or_404(db, employee_id, principal)
    from routers.submissions import _to_response as sub_to_response
    rows = (
        db.query(Submission)
        .filter(Submission.employee_id == employee_id)
        .order_by(Submission.updated_at.desc())
        .limit(100)
        .all()
    )
    return [sub_to_response(r, db) for r in rows]


@router.get("/{employee_id}/interviews")
async def get_candidate_interviews(
    employee_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_employee_or_404(db, employee_id, principal)
    from routers.interviews import _to_response as int_to_response
    rows = (
        db.query(Interview)
        .join(Submission, Submission.id == Interview.submission_id)
        .filter(Submission.employee_id == employee_id)
        .order_by(Interview.scheduled_at.desc())
        .limit(100)
        .all()
    )
    return [int_to_response(r, db) for r in rows]


@router.get("/{employee_id}/offers")
async def get_candidate_offers(
    employee_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_employee_or_404(db, employee_id, principal)
    from routers.offers import _to_response as off_to_response
    rows = (
        db.query(Offer)
        .join(Submission, Submission.id == Offer.submission_id)
        .filter(Submission.employee_id == employee_id)
        .order_by(Offer.offer_date.desc())
        .limit(100)
        .all()
    )
    return [off_to_response(r, db) for r in rows]


@router.get("/{employee_id}/matches")
async def get_candidate_matches(
    employee_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    """Job outreach / send rows linked to this candidate (saved matches)."""
    _get_employee_or_404(db, employee_id, principal)
    sends = (
        db.query(JobEmployeeSend)
        .filter(JobEmployeeSend.employee_id == employee_id)
        .order_by(JobEmployeeSend.created_at.desc())
        .limit(100)
        .all()
    )
    out = []
    for s in sends:
        job = db.query(JobRequirement).filter(JobRequirement.id == s.job_requirement_id).first()
        out.append({
            "id": s.id,
            "job_requirement_id": s.job_requirement_id,
            "job_title": job.job_title if job else None,
            "client": job.client if job else None,
            "match_score": s.match_score_at_send,
            "delivery_status": s.delivery_status,
            "employee_response": s.employee_response,
            "sent_at": s.sent_at,
            "created_at": s.created_at,
        })
    return out


@router.post("/{employee_id}/matches")
async def run_candidate_job_matches(
    employee_id: int,
    body: dict | None = None,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    """Score this candidate against open jobs and optionally persist match rows.

    Reuses job_employee_match — does not create duplicate JobEmployeeSend rows
    when a send already exists for the same job+candidate pair.
    """
    employee = _get_employee_or_404(db, employee_id, principal)
    payload = body or {}
    job_ids = payload.get("job_ids") or []
    save = bool(payload.get("save", True))
    min_score = int(payload.get("min_score") or 0)

    open_raw, open_unmapped = job_raw_statuses_matching_group("open")
    from services.job_status import _ALL_KNOWN_RAW_STATUSES
    jq = db.query(JobRequirement)
    if job_ids:
        jq = jq.filter(JobRequirement.id.in_(job_ids))
    else:
        if open_unmapped:
            jq = jq.filter(or_(
                JobRequirement.status.in_(list(open_raw)),
                ~JobRequirement.status.in_(list(_ALL_KNOWN_RAW_STATUSES)),
            ))
        else:
            jq = jq.filter(JobRequirement.status.in_(list(open_raw)))
    jobs = jq.order_by(JobRequirement.updated_at.desc()).limit(50).all()

    primary = (
        db.query(EmployeeResume)
        .filter(EmployeeResume.employee_id == employee_id, EmployeeResume.is_primary == True)  # noqa: E712
        .first()
    )
    if not primary:
        primary = (
            db.query(EmployeeResume)
            .filter(EmployeeResume.employee_id == employee_id)
            .order_by(EmployeeResume.uploaded_at.desc())
            .first()
        )
    primary_map = {employee_id: primary} if primary else {}

    results = []
    for job in jobs:
        scored = match_employees_to_job(job, [employee], primary_map)
        if not scored:
            continue
        row = scored[0]
        if row["match_score"] < min_score:
            continue
        saved_id = None
        if save:
            existing = (
                db.query(JobEmployeeSend)
                .filter(
                    JobEmployeeSend.job_requirement_id == job.id,
                    JobEmployeeSend.employee_id == employee_id,
                )
                .first()
            )
            if existing:
                existing.match_score_at_send = row["match_score"]
                saved_id = existing.id
            else:
                send = JobEmployeeSend(
                    job_requirement_id=job.id,
                    employee_id=employee_id,
                    match_score_at_send=row["match_score"],
                    delivery_status="Draft",
                    employee_response="Pending",
                    sent_by=principal.user_id,
                )
                db.add(send)
                db.flush()
                saved_id = send.id
        results.append({
            "id": saved_id,
            "job_requirement_id": job.id,
            "job_title": job.job_title,
            "client": job.client,
            "match_score": row["match_score"],
            "matching_skills": row.get("matching_skills"),
            "missing_skills": row.get("missing_skills"),
            "match_reason": row.get("match_reason"),
            "score_breakdown": row.get("score_breakdown"),
            "compatibility_warnings": row.get("compatibility_warnings"),
            "recommendation": row.get("match_reason"),
        })
    if save:
        db.add(CRMActivity(
            activity_type="Note",
            subject="Job match created",
            description=f"Matched to {len(results)} job(s)",
            employee_id=employee_id,
            activity_date=datetime.utcnow(),
            created_by=principal.user_id,
        ))
        db.commit()
    results.sort(key=lambda x: x["match_score"] or 0, reverse=True)
    return results


@router.get("/{employee_id}/activities")
async def get_candidate_activities(
    employee_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_employee_or_404(db, employee_id, principal)
    rows = (
        db.query(CRMActivity)
        .filter(CRMActivity.employee_id == employee_id)
        .order_by(CRMActivity.activity_date.desc(), CRMActivity.created_at.desc())
        .limit(100)
        .all()
    )
    return rows


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int,
    body: EmployeeUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    employee = _get_employee_or_404(db, employee_id, principal)
    data = body.model_dump(exclude_unset=True)
    if "email" in data or "phone" in data:
        matches = find_duplicate_matches(
            db,
            email=data.get("email", employee.email),
            phone=data.get("phone", employee.phone),
            name=data.get("name", employee.name),
            exclude_id=employee_id,
        )
        hard = [m for m in matches if m.match_reason in ("email", "phone")]
        if hard and principal.role != "admin":
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "A possible existing candidate was found.",
                    "matches": [m.model_dump() for m in hard],
                },
            )
    for key, value in data.items():
        setattr(employee, key, value)
    db.commit()
    db.refresh(employee)
    log_audit(db, "employee.updated", "employee", employee.id, f"Updated candidate {employee.name}", principal.user_id)
    return _to_response(employee)


@router.patch("/{employee_id}/status", response_model=EmployeeResponse)
async def update_employee_status(
    employee_id: int,
    body: EmployeeStatusUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    employee = _get_employee_or_404(db, employee_id, principal)
    employee.status = body.status
    db.commit()
    db.refresh(employee)
    log_audit(db, "employee.status", "employee", employee.id, f"Status → {body.status}", principal.user_id)
    db.add(CRMActivity(
        activity_type="Note",
        subject="Status changed",
        description=f"Status → {body.status} ({normalize_candidate_status(body.status)})",
        employee_id=employee.id,
        activity_date=datetime.utcnow(),
        created_by=principal.user_id,
    ))
    db.commit()
    return _to_response(employee)


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: int,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    employee = _get_employee_or_404(db, employee_id, principal)
    sub_count = db.query(func.count(Submission.id)).filter(Submission.employee_id == employee_id).scalar() or 0
    interview_count = (
        db.query(func.count(Interview.id))
        .join(Submission, Submission.id == Interview.submission_id)
        .filter(Submission.employee_id == employee_id)
        .scalar() or 0
    )
    offer_count = (
        db.query(func.count(Offer.id))
        .join(Submission, Submission.id == Offer.submission_id)
        .filter(Submission.employee_id == employee_id)
        .scalar() or 0
    )
    if sub_count or interview_count or offer_count:
        raise HTTPException(
            status_code=409,
            detail="Candidate has submissions, interviews, or offers — set status to Inactive instead of deleting.",
        )
    display = normalize_candidate_status(employee.status)
    if display not in ("New", "Inactive") and (employee.status or "") not in ARCHIVED_STATUSES | {"New", "Active"}:
        # Allow delete for New/Inactive/Active with no history; block for pipeline histories already covered.
        pass
    name = employee.name
    db.delete(employee)
    db.commit()
    log_audit(db, "employee.deleted", "employee", employee_id, f"Deleted candidate {name}", principal.user_id)
    return {"message": "Candidate deleted."}
