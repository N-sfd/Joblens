from fastapi import APIRouter, HTTPException
from models import CoverLetterRequest
from services.claude_service import generate_cover_letter

router = APIRouter()


@router.post("/")
async def create_cover_letter(request: CoverLetterRequest):
    if len(request.resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume text is too short.")
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short.")
    try:
        letter = await generate_cover_letter(
            resume_text=request.resume_text,
            job_description=request.job_description,
            company_name=request.company_name or "the company",
            tone=request.tone or "professional",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")
    return {"cover_letter": letter}
