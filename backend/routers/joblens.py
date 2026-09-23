"""JobLens AI Career Intelligence — seeker-facing analyze API.

Does not touch CRM/ATS routers. Guest or JWT ownership via get_owner.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import os
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from auth import Owner, get_owner, owned
from database import get_db
from models import JoblensAnalysis
from routers.resume import extract_docx_text, extract_pdf_text
from services.joblens_analyze import run_analysis
from services.joblens_parsers import parse_job, parse_resume
from services.rate_limit import check_rate_limit

logger = logging.getLogger("joblens.api")
router = APIRouter()

MAX_RESUME_BYTES = 10 * 1024 * 1024
ALLOWED_EXT = {".pdf", ".docx", ".txt"}


def _joblens_rate_limit(request: Request, owner: Owner) -> None:
    limit = int(os.getenv("JOBLENS_RATE_LIMIT_PER_HOUR", "20") or "20")
    # Reuse minute window scaled: approximate hourly by limit/60 per minute minimum 1,
    # but prefer a dedicated hourly-ish bucket using 3600s window via check_rate_limit's 60s —
    # use a higher per-minute ceiling derived from hourly budget.
    per_min = max(1, (limit + 59) // 60) + 2
    check_rate_limit(
        request,
        bucket="joblens_analyze",
        limit=max(per_min, 5),
        user_id=str(owner.user_id or owner.guest_id or "anon"),
    )


class AnalyzeTextBody(BaseModel):
    resume_text: str
    job_description: str
    job_title: str | None = None
    company_name: str | None = None
    custom_weights: dict[str, float] | None = None
    save: bool = True
    resume_filename: str | None = None
    force_new_version: bool = False


class ParseResumeBody(BaseModel):
    resume_text: str


class ParseJobBody(BaseModel):
    job_description: str
    job_title: str | None = None
    company_name: str | None = None


def _extract_upload(filename: str, content: bytes) -> str:
    lower = (filename or "").lower()
    if lower.endswith(".doc") and not lower.endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail="The legacy .doc format isn't supported. Please save as .docx or PDF.",
        )
    try:
        if lower.endswith(".pdf"):
            return extract_pdf_text(content)
        if lower.endswith(".docx"):
            return extract_docx_text(content)
        if lower.endswith(".txt"):
            return content.decode("utf-8", errors="ignore")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read this résumé file.")
    raise HTTPException(status_code=400, detail="Unsupported format. Upload PDF, DOCX, or TXT.")


def _serialize_row(row: JoblensAnalysis, *, include_result: bool = True) -> dict:
    result = json.loads(row.result_json) if row.result_json else {}
    gaps = result.get("gap_analysis") or {}
    out = {
        "id": row.id,
        "resume_filename": row.resume_filename,
        "resume_version": row.resume_version,
        "job_title": row.job_title,
        "company_name": row.company_name,
        "overall_score": row.overall_score,
        "required_skills_score": row.required_skills_score,
        "preferred_skills_score": row.preferred_skills_score,
        "experience_score": row.experience_score,
        "missing_skills": gaps.get("missing_skills") or [],
        "not_demonstrated_skills": gaps.get("not_demonstrated_skills") or [],
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "content_hash": row.content_hash,
    }
    if include_result:
        # Never return raw résumé / JD full text from storage payload if present
        safe = {k: v for k, v in result.items() if k not in ("resume_text", "job_description")}
        out["result"] = safe
    return out


def _save_analysis(
    db: Session,
    owner: Owner,
    result: dict,
    *,
    force_new_version: bool = False,
) -> JoblensAnalysis:
    content_hash = result.get("content_hash") or ""
    existing = (
        owned(db.query(JoblensAnalysis), JoblensAnalysis, owner)
        .filter(JoblensAnalysis.content_hash == content_hash)
        .order_by(JoblensAnalysis.resume_version.desc())
        .first()
    )
    if existing and not force_new_version:
        return existing

    version = 1
    if existing and force_new_version:
        version = int(existing.resume_version or 1) + 1

    cats = result.get("category_scores") or {}
    # Persist without raw résumé/JD text
    persist = {k: v for k, v in result.items() if k not in ("resume_text", "job_description")}
    row = JoblensAnalysis(
        resume_filename=result.get("resume_filename"),
        resume_version=version,
        job_title=result.get("job_title"),
        company_name=result.get("company_name"),
        content_hash=content_hash,
        job_description_hash=hashlib.sha256(
            (result.get("job_title") or "").encode("utf-8")
        ).hexdigest()[:64],
        result_json=json.dumps(persist),
        overall_score=result.get("overall_score"),
        required_skills_score=cats.get("required_skills"),
        preferred_skills_score=cats.get("preferred_skills"),
        experience_score=cats.get("relevant_experience"),
        guest_id=owner.guest_id,
        user_id=owner.user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    logger.info(
        "joblens.analysis.saved id=%s user_id=%s overall=%s",
        row.id, owner.user_id, row.overall_score,
    )
    return row


def _repeated_gaps(rows: list[JoblensAnalysis]) -> list[dict]:
    counter: Counter[str] = Counter()
    for row in rows:
        try:
            data = json.loads(row.result_json or "{}")
        except json.JSONDecodeError:
            continue
        gaps = data.get("gap_analysis") or {}
        for skill in (gaps.get("missing_skills") or []) + (gaps.get("not_demonstrated_skills") or []):
            counter[str(skill)] += 1
    total = len(rows) or 1
    insights = []
    for skill, count in counter.most_common(8):
        if count >= 2:
            insights.append({
                "skill": skill,
                "count": count,
                "of": total,
                "message": f"{skill} appears as a gap in {count} of your last {total} analyses.",
            })
    return insights


@router.post("/analyze")
async def analyze(
    request: Request,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    """Analyze résumé (file or text) against a job description.

    Parses JSON vs multipart manually. Declaring File()/Form() params makes
    Starlette treat every request as form-encoded and can reset JSON POSTs
    proxied from Vercel (browser shows \"Failed to fetch\").
    """
    _joblens_rate_limit(request, owner)

    content_type = (request.headers.get("content-type") or "").lower()
    file_upload: UploadFile | None = None
    resume_text: str | None = None
    job_description: str | None = None
    job_title: str | None = None
    company_name: str | None = None
    save = "true"
    force_new_version = "false"
    custom_weights = None
    resume_filename: str | None = None

    if "multipart/form-data" in content_type:
        form = await request.form()
        raw_file = form.get("file")
        if raw_file is not None and hasattr(raw_file, "read"):
            file_upload = raw_file  # type: ignore[assignment]
        resume_text = _form_str(form.get("resume_text"))
        job_description = _form_str(form.get("job_description"))
        job_title = _form_str(form.get("job_title"))
        company_name = _form_str(form.get("company_name"))
        save = _form_str(form.get("save")) or "true"
        force_new_version = _form_str(form.get("force_new_version")) or "false"
        resume_filename = file_upload.filename if file_upload is not None else None
    else:
        try:
            body = await request.json()
        except Exception:
            body = None
        if isinstance(body, dict):
            resume_text = body.get("resume_text")
            job_description = body.get("job_description")
            job_title = body.get("job_title")
            company_name = body.get("company_name")
            save = "true" if body.get("save", True) else "false"
            force_new_version = "true" if body.get("force_new_version") else "false"
            custom_weights = body.get("custom_weights")
            resume_filename = body.get("resume_filename")

    filename = resume_filename
    text = (resume_text or "").strip()
    if file_upload is not None:
        content = await file_upload.read()
        if len(content) > MAX_RESUME_BYTES:
            raise HTTPException(status_code=413, detail="The uploaded résumé is too large (max 10 MB).")
        filename = file_upload.filename or filename
        ext = "." + (filename or "").rsplit(".", 1)[-1].lower() if filename and "." in filename else ""
        if ext and ext not in ALLOWED_EXT:
            raise HTTPException(status_code=400, detail="Unsupported format. Upload PDF, DOCX, or TXT.")
        text = _extract_upload(filename or "", content)
        logger.info(
            "joblens.upload ok file_type=%s file_size=%s",
            ext or "unknown", len(content),
        )

    jd = (job_description or "").strip()
    if len(text) < 50:
        raise HTTPException(status_code=422, detail="Résumé text is too short.")
    if len(jd) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short.")

    try:
        result = await run_analysis(
            resume_text=text,
            job_description=jd,
            job_title=job_title,
            company_name=company_name,
            custom_weights=custom_weights if isinstance(custom_weights, dict) else None,
            resume_filename=filename,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("joblens.analyze.failed error_code=%s", type(e).__name__)
        raise HTTPException(status_code=500, detail="Analysis failed. Please try again.") from e

    analysis_id = None
    duplicate = False
    should_save = str(save or "true").lower() not in ("0", "false", "no")
    force = str(force_new_version or "false").lower() in ("1", "true", "yes")
    if should_save:
        existing = (
            owned(db.query(JoblensAnalysis), JoblensAnalysis, owner)
            .filter(JoblensAnalysis.content_hash == result["content_hash"])
            .first()
        )
        if existing and not force:
            analysis_id = existing.id
            duplicate = True
            result["analysis_id"] = analysis_id
            result["saved"] = True
            result["duplicate"] = True
            result["resume_version"] = existing.resume_version
            return result
        row = _save_analysis(db, owner, result, force_new_version=force)
        analysis_id = row.id
        result["resume_version"] = row.resume_version

    result["analysis_id"] = analysis_id
    result["saved"] = bool(analysis_id)
    result["duplicate"] = duplicate
    return result


def _form_str(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if hasattr(value, "read"):
        return None
    return str(value)


@router.get("/analyses")
async def list_analyses(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=50),
):
    rows = (
        owned(db.query(JoblensAnalysis), JoblensAnalysis, owner)
        .order_by(JoblensAnalysis.created_at.desc())
        .limit(limit)
        .all()
    )
    items = [_serialize_row(r, include_result=False) for r in rows]
    return {
        "items": items,
        "repeated_gaps": _repeated_gaps(rows),
    }


@router.get("/analyses/{analysis_id}")
async def get_analysis(
    analysis_id: int,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    row = (
        owned(db.query(JoblensAnalysis), JoblensAnalysis, owner)
        .filter(JoblensAnalysis.id == analysis_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    return _serialize_row(row, include_result=True)


@router.delete("/analyses/{analysis_id}")
async def delete_analysis(
    analysis_id: int,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    row = (
        owned(db.query(JoblensAnalysis), JoblensAnalysis, owner)
        .filter(JoblensAnalysis.id == analysis_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Analysis not found.")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/parse-resume")
async def parse_resume_endpoint(
    request: Request,
    body: ParseResumeBody,
    owner: Owner = Depends(get_owner),
):
    _joblens_rate_limit(request, owner)
    if len(body.resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Résumé text is too short.")
    parsed, used_ai = await parse_resume(body.resume_text)
    return {"parsed_resume": parsed, "ai_used": used_ai}


@router.post("/parse-job")
async def parse_job_endpoint(
    request: Request,
    body: ParseJobBody,
    owner: Owner = Depends(get_owner),
):
    _joblens_rate_limit(request, owner)
    if len(body.job_description.strip()) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short.")
    parsed, used_ai = await parse_job(
        body.job_description, job_title=body.job_title, company=body.company_name
    )
    return {"parsed_job": parsed, "ai_used": used_ai}


@router.post("/compare")
async def compare_endpoint(
    request: Request,
    body: AnalyzeTextBody,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    """Alias of analyze for text-only comparison."""
    _joblens_rate_limit(request, owner)
    result = await run_analysis(
        resume_text=body.resume_text,
        job_description=body.job_description,
        job_title=body.job_title,
        company_name=body.company_name,
        custom_weights=body.custom_weights,
        resume_filename=body.resume_filename,
    )
    if body.save:
        existing = (
            owned(db.query(JoblensAnalysis), JoblensAnalysis, owner)
            .filter(JoblensAnalysis.content_hash == result["content_hash"])
            .first()
        )
        if existing and not body.force_new_version:
            result["analysis_id"] = existing.id
            result["saved"] = True
            result["duplicate"] = True
            return result
        row = _save_analysis(db, owner, result, force_new_version=body.force_new_version)
        result["analysis_id"] = row.id
        result["saved"] = True
        result["duplicate"] = False
    return result
