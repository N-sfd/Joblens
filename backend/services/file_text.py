import io

from fastapi import HTTPException, UploadFile

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".txt"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB


async def read_upload(file: UploadFile) -> tuple[str, bytes]:
    """Validate an uploaded document's extension/size and return (filename, bytes)."""
    filename = file.filename or ""
    lower = filename.lower()
    if lower.endswith(".doc") and not lower.endswith(".docx"):
        raise HTTPException(
            status_code=400,
            detail="The legacy .doc format isn't supported. Please save as .docx, PDF, or TXT and try again.",
        )
    if not any(lower.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(status_code=400, detail="Unsupported format. Upload a PDF, DOCX, or TXT file.")
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max size is 10 MB.")
    return filename, content


def extract_text(filename: str, content: bytes) -> str:
    """Extract plain text from a PDF, DOCX, or TXT document's raw bytes."""
    lower = filename.lower()
    try:
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
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Could not read this file. Make sure it's a valid PDF, DOCX, or TXT document.",
        )
    raise HTTPException(status_code=400, detail="Unsupported format. Upload a PDF, DOCX, or TXT file.")
