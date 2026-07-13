import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Employee,
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeeListItem,
    EmployeeListResponse,
    EmployeeStatusUpdate,
    EmployeeResume,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from routers.employee_resumes import _read_and_validate, _extract_text
from services.audit import log_audit
from services.claude_service import parse_employee_resume
from services.rate_limit import rate_limit_ai
from services.ai_errors import raise_clean_ai_error

logger = logging.getLogger(__name__)

router = APIRouter()

ARCHIVED_STATUSES = {"Inactive", "Former Employee", "Do Not Contact"}


def _employee_to_list_item(employee: Employee, resume_count: int, resume_status: str, has_primary: bool) -> EmployeeListItem:
    base = EmployeeResponse.model_validate(employee)
    return EmployeeListItem(
        **base.model_dump(),
        resume_count=resume_count,
        resume_status=resume_status,
        has_primary_resume=has_primary,
    )


def _resume_summary(db: Session, employee_ids: list[int]) -> dict[int, tuple[int, str, bool]]:
    """Return {employee_id: (count, status_label, has_primary)} for list rows."""
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

    # Fallback: most recent resume when none marked primary.
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


@router.post("/", response_model=EmployeeResponse, status_code=201)
async def create_employee(
    body: EmployeeCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    data = body.model_dump()
    if principal.user_id:
        data["created_by"] = principal.user_id
    employee = Employee(**data)
    db.add(employee)
    db.commit()
    db.refresh(employee)
    log_audit(db, "employee.created", "employee", employee.id, f"Created employee {employee.name}", principal.user_id)
    return employee


@router.get("/", response_model=EmployeeListResponse)
async def list_employees(
    q: str | None = Query(None, description="Search name, email, skill, location"),
    status: str | None = Query(None),
    availability: str | None = Query(None),
    work_authorization: str | None = Query(None),
    primary_skill: str | None = Query(None),
    location: str | None = Query(None),
    employment_type: str | None = Query(None),
    archived: bool | None = Query(None, description="True=archived only, False=active only"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    query = db.query(Employee)

    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(
            Employee.name.ilike(term),
            Employee.first_name.ilike(term),
            Employee.last_name.ilike(term),
            Employee.email.ilike(term),
            Employee.personal_email.ilike(term),
            Employee.primary_skill.ilike(term),
            Employee.current_location.ilike(term),
            Employee.location.ilike(term),
        ))

    if status:
        query = query.filter(Employee.status == status)
    if availability:
        query = query.filter(Employee.availability == availability)
    if work_authorization:
        query = query.filter(Employee.work_authorization.ilike(f"%{work_authorization.strip()}%"))
    if primary_skill:
        query = query.filter(Employee.primary_skill.ilike(f"%{primary_skill.strip()}%"))
    if location:
        query = query.filter(or_(
            Employee.current_location.ilike(f"%{location.strip()}%"),
            Employee.location.ilike(f"%{location.strip()}%"),
        ))
    if employment_type:
        query = query.filter(Employee.employment_type == employment_type)

    if archived is True:
        query = query.filter(Employee.status.in_(ARCHIVED_STATUSES))
    elif archived is False:
        query = query.filter(~Employee.status.in_(ARCHIVED_STATUSES))

    total = query.count()
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 1
    employees = (
        query.order_by(Employee.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    ids = [e.id for e in employees]
    resume_map = _resume_summary(db, ids)
    items = [
        _employee_to_list_item(e, *resume_map.get(e.id, (0, "None", False)))
        for e in employees
    ]

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
    """Parse a resume file without creating an employee (for add-from-resume flow)."""
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
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return employee


@router.put("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: int,
    body: EmployeeUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(employee, key, value)
    db.commit()
    db.refresh(employee)
    log_audit(db, "employee.updated", "employee", employee.id, f"Updated employee {employee.name}", principal.user_id)
    return employee


@router.patch("/{employee_id}/status", response_model=EmployeeResponse)
async def update_employee_status(
    employee_id: int,
    body: EmployeeStatusUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    employee.status = body.status
    db.commit()
    db.refresh(employee)
    log_audit(db, "employee.status", "employee", employee.id, f"Status → {body.status}", principal.user_id)
    return employee


@router.delete("/{employee_id}")
async def delete_employee(
    employee_id: int,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    name = employee.name
    db.delete(employee)
    db.commit()
    log_audit(db, "employee.deleted", "employee", employee_id, f"Deleted employee {name}", principal.user_id)
    return {"message": "Employee deleted."}
