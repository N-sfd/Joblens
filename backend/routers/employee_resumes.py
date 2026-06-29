import io
import json
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from database import get_db
from models import Employee, EmployeeResume, EmployeeResumeResponse
from ats_auth import get_current_ats_user
from services.claude_service import parse_employee_resume

router = APIRouter()

# Local dev file storage. See module TODO below before deploying.
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "employee_resumes")

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}

# TODO (production): move uploaded resume storage off the local filesystem —
# Render/most PaaS hosts have ephemeral disks, so files saved here will be lost
# on redeploy. Swap `_save_file` below for an upload to Supabase Storage,
# Zoho WorkDrive, or S3-compatible storage, and store the returned URL/key in
# `file_path` instead of a local path.


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


def _save_file(employee_id: int, filename: str, content: bytes) -> str:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(filename)[1].lower()
    stored_name = f"{employee_id}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, stored_name)
    with open(path, "wb") as f:
        f.write(content)
    return path


def _to_response(resume: EmployeeResume) -> EmployeeResumeResponse:
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
        parsed_skills=json.loads(resume.parsed_skills) if resume.parsed_skills else [],
        parsed_primary_skill=resume.parsed_primary_skill,
        parsed_total_experience=resume.parsed_total_experience,
        parsed_job_titles=json.loads(resume.parsed_job_titles) if resume.parsed_job_titles else [],
        parsed_clients=json.loads(resume.parsed_clients) if resume.parsed_clients else [],
        parsed_certifications=json.loads(resume.parsed_certifications) if resume.parsed_certifications else [],
        parsed_education=json.loads(resume.parsed_education) if resume.parsed_education else [],
        parsed_summary=resume.parsed_summary,
        is_primary=resume.is_primary,
        uploaded_at=resume.uploaded_at,
        updated_at=resume.updated_at,
    )


def _get_employee_or_404(db: Session, employee_id: int) -> Employee:
    employee = db.query(Employee).filter(Employee.id == employee_id).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return employee


@router.post("/{employee_id}/resume", response_model=EmployeeResumeResponse, status_code=201)
async def upload_employee_resume(
    employee_id: int,
    file: UploadFile = File(...),
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    employee = _get_employee_or_404(db, employee_id)

    filename = file.filename or "resume"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Unsupported format. Upload a PDF, DOCX, or TXT file.")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="The uploaded file is empty.")

    try:
        resume_text = _extract_text(filename, content)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read this file. Make sure it's a valid PDF, DOCX, or TXT resume.")

    if len(resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Could not extract readable text. Ensure the file is not image-only.")

    file_path = _save_file(employee_id, filename, content)

    try:
        parsed = await parse_employee_resume(resume_text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")

    # New uploads become the primary resume; demote any previous ones.
    db.query(EmployeeResume).filter(EmployeeResume.employee_id == employee_id).update({"is_primary": False})

    resume = EmployeeResume(
        employee_id=employee_id,
        filename=filename,
        file_type=ext.lstrip("."),
        file_size=len(content),
        file_path=file_path,
        resume_text=resume_text,
        parsed_name=parsed.get("name") or None,
        parsed_email=parsed.get("email") or None,
        parsed_phone=parsed.get("phone") or None,
        parsed_skills=json.dumps(parsed.get("skills") or []),
        parsed_primary_skill=parsed.get("primary_skill") or None,
        parsed_total_experience=parsed.get("total_experience") or None,
        parsed_job_titles=json.dumps(parsed.get("job_titles") or []),
        parsed_clients=json.dumps(parsed.get("clients") or []),
        parsed_certifications=json.dumps(parsed.get("certifications") or []),
        parsed_education=json.dumps(parsed.get("education") or []),
        parsed_summary=parsed.get("summary") or None,
        is_primary=True,
    )
    db.add(resume)

    # Fill empty employee fields from the parsed resume — never overwrite existing data.
    if not employee.phone and parsed.get("phone"):
        employee.phone = parsed["phone"]
    if not employee.primary_skill and parsed.get("primary_skill"):
        employee.primary_skill = parsed["primary_skill"]
    if not employee.secondary_skills and parsed.get("skills"):
        employee.secondary_skills = ", ".join(parsed["skills"])
    if not employee.total_experience and parsed.get("total_experience"):
        employee.total_experience = parsed["total_experience"]

    db.commit()
    db.refresh(resume)
    return _to_response(resume)


@router.get("/{employee_id}/resumes", response_model=list[EmployeeResumeResponse])
async def list_employee_resumes(
    employee_id: int,
    _: None = Depends(get_current_ats_user),
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
    _: None = Depends(get_current_ats_user),
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


@router.delete("/{employee_id}/resumes/{resume_id}")
async def delete_employee_resume(
    employee_id: int,
    resume_id: int,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    resume = (
        db.query(EmployeeResume)
        .filter(EmployeeResume.id == resume_id, EmployeeResume.employee_id == employee_id)
        .first()
    )
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")

    try:
        if os.path.exists(resume.file_path):
            os.remove(resume.file_path)
    except OSError:
        pass

    db.delete(resume)
    db.commit()
    return {"message": "Resume deleted."}
