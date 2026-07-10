"""Pluggable storage backend for employee resume files.

STORAGE_PROVIDER selects where uploaded resumes live:
  - "local" (default): written under UPLOAD_DIR on the API's own disk. Fine for
    local dev, but Render/most PaaS hosts have ephemeral disks — files saved
    this way are lost on redeploy.
  - "supabase": uploaded to a private Supabase Storage bucket via the REST API
    using the service-role key (bypasses RLS), so files survive redeploys.

Uses plain urllib.request rather than the supabase-py SDK, matching the
dependency-light style already used for Clerk API calls in ats_auth.py.
"""

import mimetypes
import os
import urllib.error
import urllib.request
import uuid
from typing import TYPE_CHECKING

from fastapi import HTTPException

if TYPE_CHECKING:
    from models import EmployeeResume

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "employee_resumes")

STORAGE_PROVIDER = os.getenv("STORAGE_PROVIDER", "local").strip().lower() or "local"
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
SUPABASE_RESUME_BUCKET = os.getenv("SUPABASE_RESUME_BUCKET", "resumes").strip() or "resumes"


def validate_storage_config() -> None:
    """Fail loudly at startup if STORAGE_PROVIDER=supabase is misconfigured."""
    if STORAGE_PROVIDER == "supabase" and (not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY):
        raise RuntimeError(
            "STORAGE_PROVIDER=supabase but SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY "
            "is not set. Set both (see backend/.env.example) or switch STORAGE_PROVIDER back to 'local'."
        )


def _supabase_object_url(object_path: str) -> str:
    return f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_RESUME_BUCKET}/{object_path}"


def _supabase_headers(content_type: str | None = None) -> dict:
    headers = {
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _save_local(employee_id: int, filename: str, content: bytes) -> str:
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(filename)[1].lower()
    stored_name = f"{employee_id}_{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, stored_name)
    with open(path, "wb") as f:
        f.write(content)
    return path


def _save_supabase(employee_id: int, filename: str, content: bytes) -> str:
    ext = os.path.splitext(filename)[1].lower()
    object_path = f"employees/{employee_id}/{uuid.uuid4().hex}{ext}"
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    req = urllib.request.Request(
        _supabase_object_url(object_path),
        data=content,
        method="POST",
        headers=_supabase_headers(content_type),
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 (trusted Supabase URL)
            resp.read()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        raise HTTPException(status_code=502, detail=f"Failed to upload resume to storage: {detail[:200]}")
    return object_path


def save_resume_file(employee_id: int, filename: str, content: bytes) -> tuple[str, str, str]:
    """Save an uploaded resume. Returns (provider, storage_path, file_path)."""
    if STORAGE_PROVIDER == "supabase":
        object_path = _save_supabase(employee_id, filename, content)
        return "supabase", object_path, object_path
    path = _save_local(employee_id, filename, content)
    return "local", path, path


def read_resume_file(resume: "EmployeeResume") -> bytes:
    """Read a stored resume's bytes back out, for the download endpoint."""
    if resume.storage_provider == "supabase":
        req = urllib.request.Request(_supabase_object_url(resume.storage_path), headers=_supabase_headers())
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 (trusted Supabase URL)
                return resp.read()
        except urllib.error.HTTPError:
            raise HTTPException(status_code=404, detail="Resume file is no longer available.")

    # Local: prevent path traversal — the stored file must resolve inside UPLOAD_DIR.
    upload_root = os.path.realpath(UPLOAD_DIR)
    real_path = os.path.realpath(resume.file_path)
    if not real_path.startswith(upload_root + os.sep) or not os.path.exists(real_path):
        raise HTTPException(status_code=404, detail="Resume file is no longer available.")
    with open(real_path, "rb") as f:
        return f.read()


def delete_resume_file(resume: "EmployeeResume") -> None:
    """Best-effort delete of the underlying file. Never raises — a missing file
    should not block deleting the database record."""
    if resume.storage_provider == "supabase":
        if not resume.storage_path:
            return
        req = urllib.request.Request(
            _supabase_object_url(resume.storage_path), method="DELETE", headers=_supabase_headers()
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 (trusted Supabase URL)
                resp.read()
        except urllib.error.HTTPError:
            pass
        return

    try:
        if resume.file_path and os.path.exists(resume.file_path):
            os.remove(resume.file_path)
    except OSError:
        pass
