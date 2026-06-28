from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import CoverLetterRequest, CoverLetter
from services.claude_service import generate_cover_letter
from auth import Owner, get_owner, owned, log_activity

router = APIRouter()


@router.post("/")
async def create_cover_letter(
    request: CoverLetterRequest,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    if len(request.resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume text is too short.")
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short.")
    company_name = request.company_name or "the company"
    tone = request.tone or "professional"
    try:
        letter = await generate_cover_letter(
            resume_text=request.resume_text,
            job_description=request.job_description,
            company_name=company_name,
            tone=tone,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")

    db.add(CoverLetter(
        resume_text=request.resume_text,
        job_description=request.job_description,
        company_name=request.company_name,
        tone=tone,
        content=letter,
        guest_id=owner.guest_id,
        user_id=owner.user_id,
    ))
    db.commit()
    log_activity(
        db, owner, "cover_letter_generated",
        f"Generated cover letter for {company_name}",
        f"Tone: {tone}",
    )
    return {"cover_letter": letter}


@router.get("/history", response_model=List[dict])
async def cover_letter_history(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    rows = (
        owned(db.query(CoverLetter), CoverLetter, owner)
        .order_by(CoverLetter.created_at.desc())
        .limit(20)
        .all()
    )
    return [
        {
            "id": r.id,
            "resume_text": r.resume_text,
            "job_description": r.job_description,
            "company_name": r.company_name,
            "tone": r.tone,
            "content": r.content,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
