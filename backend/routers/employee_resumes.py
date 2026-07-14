import io
import json
import mimetypes
import os
import re

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy.orm import Session

from database import get_db
from models import (
    Employee,
    EmployeeResume,
    EmployeeResumeResponse,
    EmployeeResponse,
    Interview,
    JobEmployeeSend,
    Offer,
    ResumeUploadResult,
    ResumeFieldSuggestion,
    ApplyResumeSuggestionsRequest,
    Submission,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from sqlalchemy import func
import services.storage as storage
from services.audit import log_audit
from services.claude_service import parse_employee_resume
from services.rate_limit import rate_limit_ai

router = APIRouter()

# File storage is pluggable — see services/storage.py (STORAGE_PROVIDER env var:
# local | supabase).
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".doc", ".txt"}
ALLOWED_MIME_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/octet-stream",  # some browsers send this for docx
    "text/plain",
    "",  # some clients omit content-type
}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

# Employee fields that MAY be auto-filled from a parsed resume, mapped to the
# parser's output key. Sensitive fields (visa/work auth/rates/availability/
# employment type/status) are intentionally excluded — see spec section 9.
# (employee_attr, parsed_key, label, is_list)
APPROVED_AUTO_FIELDS = [
    ("first_name", "first_name", "First Name", False),
    ("middle_name", "middle_name", "Middle Name", False),
    ("last_name", "last_name", "Last Name", False),
    ("personal_email", "email", "Personal Email", False),
    ("phone", "phone", "Phone", False),
    ("current_location", "current_location", "Current Location", False),
    ("current_job_title", "current_job_title", "Current Job Title", False),
    ("primary_skill", "primary_skill", "Primary Skill", False),
    ("secondary_skills", "secondary_skills", "Secondary Skills", True),
    ("total_experience", "total_experience_years", "Total Experience (years)", False),
    ("relevant_experience_years", "relevant_experience_years", "Relevant Experience (years)", False),
    ("linkedin_url", "linkedin_url", "LinkedIn URL", False),
    ("notes", "professional_summary", "Professional Summary", False),
]
_APPROVED_ATTRS = {attr for attr, *_ in APPROVED_AUTO_FIELDS}


def _sanitize_filename(name: str) -> str:
    """Strip any path components and unsafe characters to prevent traversal."""
    base = os.path.basename(name or "").replace("\\", "").replace("/", "")
    base = re.sub(r"[^A-Za-z0-9._ \-()]", "_", base).strip() or "resume"
    return base[:200]


def _extract_text(filename: str, content: bytes) -> str:
    lower = filename.lower()
    if lower.endswith(".pdf"):
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        return "\n".join(page.extract_text() or "" for page in reader.pages).strip()
    if lower.endswith(".docx"):
        from docx import Document
        doc = Document(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs).strip()
    if lower.endswith(".txt"):
        return content.decode("utf-8", errors="ignore").strip()
    raise HTTPException(status_code=400, detail="Unsupported format. Upload a PDF, DOCX, or TXT file.")


def _loads(value) -> list:
    if not value:
        return []
    try:
        data = json.loads(value)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


def _to_response(resume: EmployeeResume) -> EmployeeResumeResponse:
    parsed_data = None
    if resume.parsed_data:
        try:
            parsed_data = json.loads(resume.parsed_data)
        except (json.JSONDecodeError, TypeError):
            parsed_data = None
    return EmployeeResumeResponse(
        id=resume.id,
        employee_id=resume.employee_id,
        filename=resume.filename,
        file_type=resume.file_type,
        file_size=resume.file_size,
        file_path=resume.file_path,
        resume_text=resume.resume_text,
        parsed_name=resume.parsed_name,
        parsed_email=resume.parsed_email,
        parsed_phone=resume.parsed_phone,
        parsed_skills=_loads(resume.parsed_skills),
        parsed_primary_skill=resume.parsed_primary_skill,
        parsed_total_experience=resume.parsed_total_experience,
        parsed_job_titles=_loads(resume.parsed_job_titles),
        parsed_clients=_loads(resume.parsed_clients),
        parsed_industries=_loads(resume.parsed_industries),
        parsed_certifications=_loads(resume.parsed_certifications),
        parsed_education=_loads(resume.parsed_education),
        parsed_summary=resume.parsed_summary,
        parsed_data=parsed_data,
        parsing_status=resume.parsing_status or "parsed",
        is_primary=resume.is_primary,
        version_number=resume.version_number,
        uploaded_at=resume.uploaded_at,
        updated_at=resume.updated_at,
    )


def _get_employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return employee


def _get_resume_or_404(db: Session, employee_id: int, resume_id: int) -> EmployeeResume:
    resume = (
        db.query(EmployeeResume)
        .filter(EmployeeResume.id == resume_id, EmployeeResume.employee_id == employee_id)
        .first()
    )
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return resume


def _parsed_value(parsed: dict, key: str, is_list: bool) -> str:
    v = parsed.get(key)
    if is_list:
        return ", ".join(str(x).strip() for x in (v or []) if str(x).strip())
    return str(v).strip() if v not in (None, "") else ""


def _is_empty(current) -> bool:
    return current is None or str(current).strip() == ""


def apply_resume_data_to_empty_employee_fields(employee: Employee, parsed: dict):
    """Fill only empty, approved employee fields from parsed resume data.

    Returns (applied_fields, suggestions):
    - applied_fields: {attr: value} that were safe to auto-fill (field was empty)
    - suggestions: conflicts where the field already had a different value
    Never touches sensitive fields (they are not in APPROVED_AUTO_FIELDS)."""
    applied: dict[str, str] = {}
    suggestions: list[ResumeFieldSuggestion] = []
    for attr, key, label, is_list in APPROVED_AUTO_FIELDS:
        resume_value = _parsed_value(parsed, key, is_list)
        if not resume_value:
            continue
        current = getattr(employee, attr, None)
        if _is_empty(current):
            setattr(employee, attr, resume_value)
            applied[attr] = resume_value
        elif str(current).strip() != resume_value:
            suggestions.append(ResumeFieldSuggestion(
                field=attr, label=label,
                current_value=str(current).strip(), resume_value=resume_value,
            ))
    return applied, suggestions


def _populate_parsed_columns(resume: EmployeeResume, parsed: dict) -> None:
    resume.parsed_name = parsed.get("name") or parsed.get("full_name") or None
    resume.parsed_email = parsed.get("email") or None
    resume.parsed_phone = parsed.get("phone") or None
    resume.parsed_primary_skill = parsed.get("primary_skill") or None
    resume.parsed_skills = json.dumps(parsed.get("secondary_skills") or parsed.get("skills") or [])
    resume.parsed_total_experience = parsed.get("total_experience_years") or None
    resume.parsed_job_titles = json.dumps(parsed.get("job_titles") or [])
    resume.parsed_clients = json.dumps(parsed.get("clients") or [])
    resume.parsed_industries = json.dumps(parsed.get("industries") or [])
    resume.parsed_certifications = json.dumps(parsed.get("certifications") or [])
    resume.parsed_education = json.dumps(parsed.get("education") or [])
    resume.parsed_summary = parsed.get("professional_summary") or None
    resume.parsed_data = json.dumps(parsed)


def _result(db: Session, employee: Employee, resume: EmployeeResume,
            parsed: dict, parsing_status: str,
            applied: dict, suggestions: list) -> ResumeUploadResult:
    db.refresh(employee)
    db.refresh(resume)
    return ResumeUploadResult(
        resume=_to_response(resume),
        employee=EmployeeResponse.model_validate(employee),
        parsed=parsed,
        parsing_status=parsing_status,
        applied_fields=applied,
        suggestions=suggestions,
    )


async def _read_and_validate(file: UploadFile) -> tuple[str, bytes]:
    filename = _sanitize_filename(file.filename or "resume")
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported format. Upload a PDF, DOCX, or TXT file.")
    if (file.content_type or "") not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported file type. Upload a PDF, DOCX, or TXT file.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File is too large. Maximum size is 10 MB.")
    return filename, content


@router.post("/{employee_id}/resumes", response_model=ResumeUploadResult, status_code=201)
async def upload_employee_resume(
    employee_id: int,
    request: Request,
    file: UploadFile = File(...),
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    rate_limit_ai(request, principal.user_id)
    employee = _get_employee_or_404(db, employee_id)
    filename, content = await _read_and_validate(file)
    ext = os.path.splitext(filename)[1].lower()

    try:
        resume_text = _extract_text(filename, content)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read this file. It may be corrupted or password-protected.")

    if len(resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Could not extract readable text. The file may be image-only or password-protected.")

    storage_provider, storage_path, file_path = storage.save_resume_file(employee_id, filename, content)

    existing_count = db.query(EmployeeResume).filter(EmployeeResume.employee_id == employee_id).count()
    # Newest upload becomes primary (also covers "first resume is primary").
    db.query(EmployeeResume).filter(EmployeeResume.employee_id == employee_id).update({"is_primary": False})

    resume = EmployeeResume(
        employee_id=employee_id,
        filename=filename,
        original_filename=file.filename or filename,
        file_type=ext.lstrip("."),
        file_size=len(content),
        file_path=file_path,
        storage_provider=storage_provider,
        storage_path=storage_path,
        resume_text=resume_text,
        is_primary=True,
        version_number=existing_count + 1,
    )

    # If AI parsing fails, keep the uploaded file and mark parsing failed so the
    # user can Retry Parsing — never lose the upload.
    parsed: dict = {}
    parsing_status = "parsed"
    try:
        parsed = await parse_employee_resume(resume_text)
        _populate_parsed_columns(resume, parsed)
    except Exception:
        parsing_status = "failed"
        parsed = {}
    resume.parsing_status = parsing_status

    if principal.user_id:
        resume.uploaded_by = principal.user_id
    db.add(resume)
    db.flush()

    applied: dict[str, str] = {}
    suggestions: list[ResumeFieldSuggestion] = []
    if parsing_status == "parsed":
        applied, suggestions = apply_resume_data_to_empty_employee_fields(employee, parsed)

    db.commit()
    log_audit(db, "resume.uploaded", "employee_resume", resume.id, f"Uploaded resume for employee {employee_id}", principal.user_id)
    return _result(db, employee, resume, parsed, parsing_status, applied, suggestions)


# Backward-compatible singular alias (older clients). Returns just the resume.
@router.post("/{employee_id}/resume", response_model=EmployeeResumeResponse, status_code=201)
async def upload_employee_resume_legacy(
    employee_id: int,
    request: Request,
    file: UploadFile = File(...),
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    result = await upload_employee_resume(employee_id, request, file, principal, db)
    return result.resume


@router.get("/{employee_id}/resumes", response_model=list[EmployeeResumeResponse])
async def list_employee_resumes(
    employee_id: int,
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_employee_or_404(db, employee_id)
    resumes = (
        db.query(EmployeeResume)
        .filter(EmployeeResume.employee_id == employee_id)
        .order_by(EmployeeResume.uploaded_at.desc())
        .all()
    )
    return [_to_response(r) for r in resumes]


@router.get("/{employee_id}/resume/latest", response_model=EmployeeResumeResponse)
async def get_latest_employee_resume(
    employee_id: int,
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_employee_or_404(db, employee_id)
    resume = (
        db.query(EmployeeResume)
        .filter(EmployeeResume.employee_id == employee_id)
        .order_by(EmployeeResume.is_primary.desc(), EmployeeResume.uploaded_at.desc())
        .first()
    )
    if not resume:
        raise HTTPException(status_code=404, detail="No resume uploaded for this employee yet.")
    return _to_response(resume)


@router.post("/{employee_id}/resumes/{resume_id}/primary", response_model=EmployeeResumeResponse)
@router.patch("/{employee_id}/resumes/{resume_id}/primary", response_model=EmployeeResumeResponse)
async def set_primary_resume(
    employee_id: int,
    resume_id: int,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    resume = _get_resume_or_404(db, employee_id, resume_id)
    db.query(EmployeeResume).filter(EmployeeResume.employee_id == employee_id).update({"is_primary": False})
    resume.is_primary = True
    db.commit()
    db.refresh(resume)
    log_audit(db, "resume.primary", "employee_resume", resume.id, f"Set primary resume for employee {employee_id}", principal.user_id)
    return _to_response(resume)


@router.get("/{employee_id}/resumes/{resume_id}/download")
async def download_employee_resume(
    employee_id: int,
    resume_id: int,
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    resume = _get_resume_or_404(db, employee_id, resume_id)
    content = storage.read_resume_file(resume)
    media_type = mimetypes.guess_type(resume.filename)[0] or "application/octet-stream"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{resume.filename}"'},
    )


@router.post("/{employee_id}/resumes/{resume_id}/reparse", response_model=ResumeUploadResult)
async def reparse_employee_resume(
    employee_id: int,
    resume_id: int,
    request: Request,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    rate_limit_ai(request, principal.user_id)
    employee = _get_employee_or_404(db, employee_id)
    resume = _get_resume_or_404(db, employee_id, resume_id)
    if not resume.resume_text or len(resume.resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="No extracted resume text available to reparse.")

    parsed: dict = {}
    parsing_status = "parsed"
    try:
        parsed = await parse_employee_resume(resume.resume_text)
        _populate_parsed_columns(resume, parsed)
    except Exception:
        parsing_status = "failed"
        parsed = {}
    resume.parsing_status = parsing_status

    applied: dict[str, str] = {}
    suggestions: list[ResumeFieldSuggestion] = []
    if parsing_status == "parsed":
        applied, suggestions = apply_resume_data_to_empty_employee_fields(employee, parsed)

    db.commit()
    log_audit(db, "resume.reparsed", "employee_resume", resume.id, f"Reparsed resume for employee {employee_id}", principal.user_id)
    return _result(db, employee, resume, parsed, parsing_status, applied, suggestions)


@router.post("/{employee_id}/resumes/{resume_id}/apply-suggestions", response_model=EmployeeResponse)
async def apply_resume_suggestions(
    employee_id: int,
    resume_id: int,
    body: ApplyResumeSuggestionsRequest,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    employee = _get_employee_or_404(db, employee_id)
    _get_resume_or_404(db, employee_id, resume_id)

    for field, value in (body.fields or {}).items():
        # Only approved (non-sensitive) fields may be applied this way.
        if field in _APPROVED_ATTRS and value is not None:
            setattr(employee, field, str(value).strip())

    db.commit()
    db.refresh(employee)
    log_audit(db, "resume.suggestions_applied", "employee", employee_id, "Applied resume field suggestions", principal.user_id)
    return EmployeeResponse.model_validate(employee)


@router.delete("/{employee_id}/resumes/{resume_id}")
async def delete_employee_resume(
    employee_id: int,
    resume_id: int,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    resume = _get_resume_or_404(db, employee_id, resume_id)
    was_primary = resume.is_primary

    # No direct resume FK on submissions — protect when the candidate has
    # business history (submissions / interviews / offers / saved matches).
    deps = (
        (db.query(func.count(Submission.id)).filter(Submission.employee_id == employee_id).scalar() or 0)
        + (
            db.query(func.count(Interview.id))
            .join(Submission, Submission.id == Interview.submission_id)
            .filter(Submission.employee_id == employee_id)
            .scalar() or 0
        )
        + (
            db.query(func.count(Offer.id))
            .join(Submission, Submission.id == Offer.submission_id)
            .filter(Submission.employee_id == employee_id)
            .scalar() or 0
        )
        + (
            db.query(func.count(JobEmployeeSend.id))
            .filter(JobEmployeeSend.employee_id == employee_id)
            .scalar() or 0
        )
    )
    if deps:
        resume.parsing_status = "archived"
        resume.is_primary = False
        if was_primary:
            latest = (
                db.query(EmployeeResume)
                .filter(
                    EmployeeResume.employee_id == employee_id,
                    EmployeeResume.id != resume_id,
                    EmployeeResume.parsing_status != "archived",
                )
                .order_by(EmployeeResume.uploaded_at.desc())
                .first()
            )
            if latest:
                latest.is_primary = True
        db.commit()
        log_audit(
            db, "resume.archived", "employee_resume", resume_id,
            f"Archived resume for candidate {employee_id} (dependent records)",
            principal.user_id,
        )
        return {"message": "Resume archived because dependent records exist.", "archived": True}

    storage.delete_resume_file(resume)

    db.delete(resume)
    db.flush()

    # If we removed the primary, promote the most recent remaining resume.
    if was_primary:
        latest = (
            db.query(EmployeeResume)
            .filter(EmployeeResume.employee_id == employee_id)
            .order_by(EmployeeResume.uploaded_at.desc())
            .first()
        )
        if latest:
            latest.is_primary = True

    db.commit()
    log_audit(db, "resume.deleted", "employee_resume", resume_id, f"Deleted resume for employee {employee_id}", principal.user_id)
    return {"message": "Resume deleted.", "archived": False}
