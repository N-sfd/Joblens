from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.orm import Session
from database import get_db
from models import ResumeAnalysis
from services.claude_service import analyze_resume
import pypdf
import io
import json

router = APIRouter()


def extract_pdf_text(data: bytes) -> str:
    reader = pypdf.PdfReader(io.BytesIO(data))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n".join(pages).strip()


def extract_docx_text(data: bytes) -> str:
    from docx import Document
    doc = Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs).strip()


@router.post("/analyze")
async def analyze_resume_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content = await file.read()
    filename = file.filename or ""

    if filename.lower().endswith(".pdf"):
        text = extract_pdf_text(content)
    elif filename.lower().endswith((".docx", ".doc")):
        text = extract_docx_text(content)
    elif filename.lower().endswith(".txt"):
        text = content.decode("utf-8", errors="ignore")
    else:
        raise HTTPException(
            status_code=400,
            detail="Unsupported format. Upload a PDF, DOCX, or TXT file.",
        )

    if len(text.strip()) < 50:
        raise HTTPException(
            status_code=422,
            detail="Could not extract readable text. Ensure the file is not image-only.",
        )

    try:
        analysis = await analyze_resume(text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")

    db.add(
        ResumeAnalysis(
            filename=filename,
            ats_score=analysis.get("ats_score", 0),
            analysis_json=json.dumps(analysis),
        )
    )
    db.commit()

    return {
        "filename": filename,
        "resume_text": text,
        "analysis": analysis,
    }


@router.post("/analyze-text")
async def analyze_resume_text(body: dict):
    text = body.get("text", "")
    if len(text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Resume text is too short.")
    try:
        analysis = await analyze_resume(text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {str(e)}")
    return {"analysis": analysis}
