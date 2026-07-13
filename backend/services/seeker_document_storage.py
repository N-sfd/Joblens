"""Local storage for JobLens seeker application documents (M3).

Separate from ATS employee_resumes. No public URLs; bytes served only via
one-time extension upload-session retrieval.
"""

from __future__ import annotations

import hashlib
import mimetypes
import os
import uuid
from pathlib import Path

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads" / "seeker_documents"

ALLOWED_EXTENSIONS = {
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".rtf": "application/rtf",
}

MAX_BYTES = int(os.getenv("SEEKER_DOCUMENT_MAX_BYTES", str(5 * 1024 * 1024)))


def ensure_dir() -> None:
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def guess_mime(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return ALLOWED_EXTENSIONS.get(ext) or mimetypes.guess_type(filename)[0] or "application/octet-stream"


def extension_allowed(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def save_seeker_bytes(owner_key: str, filename: str, content: bytes) -> tuple[str, str, int, str]:
    """Return (storage_path, mime_type, size, sha256)."""
    if not extension_allowed(filename):
        raise ValueError("unsupported_file_type")
    if len(content) > MAX_BYTES:
        raise ValueError("file_too_large")
    if len(content) == 0:
        raise ValueError("empty_file")
    ensure_dir()
    ext = Path(filename).suffix.lower()
    stored = f"{owner_key}_{uuid.uuid4().hex}{ext}"
    path = UPLOAD_DIR / stored
    path.write_bytes(content)
    digest = hashlib.sha256(content).hexdigest()
    return str(path), guess_mime(filename), len(content), digest


def read_seeker_path(storage_path: str) -> bytes:
    p = Path(storage_path)
    if not p.is_file():
        raise FileNotFoundError("document_missing")
    # Constrain reads to upload dir
    try:
        p.resolve().relative_to(UPLOAD_DIR.resolve())
    except ValueError:
        raise PermissionError("invalid_storage_path") from None
    return p.read_bytes()


def delete_seeker_path(storage_path: str) -> None:
    try:
        p = Path(storage_path)
        if p.is_file():
            p.unlink()
    except OSError:
        pass
