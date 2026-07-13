"""Phase 4 Application Status — transitions, action indicators, method labels."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Optional

from models import JobApplication, JobRequirement, PUBLIC_CLOSED_JOB_STATUSES

METHOD_LABELS = {
    "employer_website": "Employer Website",
    "recruiter_email": "Recruiter Email",
    "manual": "Manual Entry",
    "assisted": "JobLens Assistant",
}

# Explicit allowed transitions for Application Status PATCH.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "Saved": {"Application Opened", "Recruiter Contacted", "Applied", "Withdrawn"},
    "Application Opened": {"Application In Progress", "Applied", "Withdrawn"},
    "Application In Progress": {"Applied", "Withdrawn"},
    "Recruiter Contacted": {"Applied", "Interviewing", "Rejected", "Withdrawn"},
    "Applied": {"Interviewing", "Offer", "Rejected", "Withdrawn"},
    "Interviewing": {"Offer", "Rejected", "Withdrawn"},
    "Offer": {"Rejected", "Withdrawn"},  # Accepted/Declined not yet modeled
    "Rejected": set(),
    "Withdrawn": set(),  # restore to Saved requires confirmed special path
}

PROTECTED_FROM_DOWNGRADE = {"Interviewing", "Offer", "Rejected", "Withdrawn", "Applied"}

DESTRUCTIVE_STATUSES = {"Withdrawn", "Rejected"}

OPENED_STALE_DAYS = int(os.getenv("APPLICATION_OPENED_STALE_DAYS", "7") or "7")


def method_label(method: Optional[str]) -> Optional[str]:
    if not method:
        return None
    return METHOD_LABELS.get(method, method.replace("_", " ").title())


def validate_transition(current: str, new_status: str, *, confirmed: bool = False) -> None:
    """Raise ValueError with a user-facing message when the transition is invalid."""
    if current == new_status:
        return
    if current == "Withdrawn" and new_status == "Saved":
        if not confirmed:
            raise ValueError(
                "Restoring a withdrawn application to Saved requires explicit confirmation."
            )
        return
    allowed = ALLOWED_TRANSITIONS.get(current)
    if allowed is None:
        raise ValueError(f"Unknown current status: {current}")
    if new_status not in allowed:
        raise ValueError(
            f"Cannot change status from {current} to {new_status}."
        )
    if new_status in DESTRUCTIVE_STATUSES and not confirmed:
        raise ValueError(
            f"Changing status to {new_status} requires explicit confirmation."
        )


def reminder_status(job: JobApplication, *, now: Optional[datetime] = None) -> str:
    now = now or datetime.utcnow()
    if job.reminder_completed_at:
        return "completed"
    if not job.follow_up_date:
        return "none"
    due = job.follow_up_date
    today = now.date()
    due_date = due.date() if hasattr(due, "date") else due
    if due_date < today:
        return "missed"
    if due_date == today:
        return "due_today"
    return "upcoming"


def parse_snapshot(job: JobApplication) -> Optional[dict]:
    if not job.job_snapshot_json:
        return None
    try:
        data = json.loads(job.job_snapshot_json)
        return data if isinstance(data, dict) else None
    except (json.JSONDecodeError, TypeError):
        return None


def source_job_flags(db, job: JobApplication) -> tuple[bool, bool]:
    """Return (available, closed_or_unpublished)."""
    if not job.source_job_requirement_id:
        return False, False
    req = db.query(JobRequirement).filter(
        JobRequirement.id == job.source_job_requirement_id
    ).first()
    if not req:
        return False, True
    closed = (
        not req.published_for_matching
        or req.review_status != "Approved"
        or req.status in PUBLIC_CLOSED_JOB_STATUSES
    )
    return (not closed), closed


def compute_action_needed(
    job: JobApplication,
    *,
    source_closed: bool = False,
    now: Optional[datetime] = None,
) -> tuple[bool, Optional[str]]:
    """Return (action_required, reason)."""
    now = now or datetime.utcnow()
    status = job.status or ""

    if status in {"Rejected", "Withdrawn"} or job.archived_at:
        return False, None
    if status == "Offer":
        rs = reminder_status(job, now=now)
        if rs in {"due_today", "missed"}:
            return True, "Follow-up task is due"
        return False, None

    rs = reminder_status(job, now=now)
    if rs == "due_today":
        return True, "Reminder due today"
    if rs == "missed":
        return True, "Follow-up is overdue"

    if status == "Application In Progress":
        return True, "Application is still in progress"

    if status == "Application Opened":
        opened = job.application_opened_at or job.last_activity_at or job.created_at
        if opened and (now - opened) >= timedelta(days=OPENED_STALE_DAYS):
            return True, f"Opened but not updated for {OPENED_STALE_DAYS}+ days"

    if status == "Recruiter Contacted" and not job.follow_up_date and not job.reminder_completed_at:
        return True, "Recruiter contacted — no follow-up reminder set"

    if source_closed and status not in {"Rejected", "Withdrawn", "Offer"}:
        return True, "Source job is no longer available"

    return False, None
