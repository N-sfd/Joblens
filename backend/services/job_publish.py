"""Shared rules for publishing ATS jobs to JobLens (Discover / Job Matcher)."""

from __future__ import annotations

import logging
from typing import Any, Optional

from models import PUBLIC_CLOSED_JOB_STATUSES

logger = logging.getLogger("joblens.publish")


def publish_blockers(data: dict[str, Any]) -> list[str]:
    """Human-readable reasons a job cannot be published to JobLens."""
    blockers: list[str] = []
    review = (data.get("review_status") or "Draft").strip()
    if review != "Approved":
        blockers.append("Approve this job before publishing.")

    status = (data.get("status") or "New").strip()
    if status in PUBLIC_CLOSED_JOB_STATUSES:
        blockers.append("Only open jobs can be published.")

    desc = (data.get("job_description") or "").strip()
    if len(desc) < 20:
        blockers.append("A job description is required.")

    if not ((data.get("recruiter_name") or "").strip() or (data.get("recruiter_email") or "").strip()):
        blockers.append("Recruiter information is incomplete.")

    return blockers


def exclusion_reason(job: Any) -> Optional[str]:
    """Why a JobRequirement row is excluded from the public published list."""
    if (getattr(job, "review_status", None) or "Draft") != "Approved":
        return "not_approved"
    if (getattr(job, "status", None) or "") in PUBLIC_CLOSED_JOB_STATUSES:
        return "not_open"
    if not bool(getattr(job, "published_for_matching", False)):
        return "not_published"
    desc = (getattr(job, "job_description", None) or "").strip()
    if len(desc) < 20:
        return "missing_description"
    return None


def log_publish_decision(
    *,
    job_id: int,
    review_status: Optional[str],
    status: Optional[str],
    published: bool,
    source: Optional[str],
    included: bool,
    reason: Optional[str] = None,
) -> None:
    logger.info(
        "publish_gate job_id=%s review=%s status=%s published=%s source=%s included=%s reason=%s",
        job_id,
        review_status,
        status,
        published,
        source,
        included,
        reason or ("included" if included else "unknown"),
    )
