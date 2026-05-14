from fastapi import APIRouter, HTTPException
from models import MatchRequest
from services.claude_service import match_job, generate_resume_bullets, create_interview_questions
from pydantic import BaseModel

router = APIRouter()


class BulletsRequest(BaseModel):
    resume_text: str
    job_description: str


@router.post("/")
async def match_resume_to_job(request: MatchRequest):
    if len(request.resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume text is too short.")
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short.")
    try:
        return await match_job(request.resume_text, request.job_description)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")


@router.post("/resume-bullets")
async def get_resume_bullets(request: BulletsRequest):
    if len(request.resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume text is too short.")
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short.")
    try:
        bullets = await generate_resume_bullets(request.resume_text, request.job_description)
        return {"bullets": bullets}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")


@router.post("/interview-questions")
async def get_interview_questions(request: BulletsRequest):
    if len(request.resume_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume text is too short.")
    if len(request.job_description.strip()) < 50:
        raise HTTPException(status_code=422, detail="Job description is too short.")
    try:
        questions = await create_interview_questions(request.resume_text, request.job_description)
        return {"questions": questions}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")
