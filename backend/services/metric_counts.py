"""Shared dashboard / reports count helpers.

Dashboard summary tiles and report overview snapshots must use these helpers
so counts never diverge between the two surfaces.
"""

from __future__ import annotations

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from models import CRMActivity, Employee, Interview, JobRequirement, Submission
from services.candidate_status import (
    raw_statuses_matching_group as candidate_raw_statuses_matching_group,
    _STATUS_DISPLAY_MAP as _CANDIDATE_STATUS_MAP,
)
from services.job_status import _ALL_KNOWN_RAW_STATUSES, raw_statuses_matching_group
from services.pipeline_status import (
    raw_statuses_matching_group as pipeline_raw_statuses_matching_group,
    _STATUS_DISPLAY_MAP as _PIPELINE_STATUS_MAP,
)

ORG_WIDE_ROLES = ("admin", "manager", "read_only")

_OPEN_STATUSES, _OPEN_INCLUDES_UNMAPPED = raw_statuses_matching_group("open")
_ACTIVE_CAND_STATUSES, _ACTIVE_CAND_INCLUDES_UNMAPPED = candidate_raw_statuses_matching_group("active")
_ALL_KNOWN_CAND_RAW = set(_CANDIDATE_STATUS_MAP.keys())
_ALL_KNOWN_PIPELINE_RAW = set(_PIPELINE_STATUS_MAP.keys())

# Same raw set the dashboard uses for Interview Scheduled vs Completed split.
_INTERVIEW_RAW = {"Interview", "Interviewing", "Scheduled", "Interview Scheduled"}


def scope_owner(principal) -> str | None:
    """None = organization-wide; a Clerk user id = restrict to their own records."""
    if principal.role in ORG_WIDE_ROLES:
        return None
    return principal.user_id


def open_jobs_filter():
    if _OPEN_INCLUDES_UNMAPPED:
        return or_(
            JobRequirement.status.in_(_OPEN_STATUSES),
            ~JobRequirement.status.in_(_ALL_KNOWN_RAW_STATUSES),
        )
    return JobRequirement.status.in_(_OPEN_STATUSES)


def active_candidates_filter():
    if _ACTIVE_CAND_INCLUDES_UNMAPPED:
        return or_(
            Employee.status.in_(list(_ACTIVE_CAND_STATUSES)),
            ~Employee.status.in_(list(_ALL_KNOWN_CAND_RAW)),
            Employee.status.is_(None),
        )
    return Employee.status.in_(list(_ACTIVE_CAND_STATUSES))


def pipeline_group_filter(group: str):
    statuses, includes_unmapped = pipeline_raw_statuses_matching_group(group)
    if includes_unmapped:
        return or_(
            Submission.status.in_(list(statuses)),
            ~Submission.status.in_(list(_ALL_KNOWN_PIPELINE_RAW)),
        )
    return Submission.status.in_(list(statuses))


def _scoped_count(db: Session, model, owner: str | None, *filters) -> int:
    q = db.query(func.count(model.id)).filter(*filters)
    if owner:
        q = q.filter(model.created_by == owner)
    return q.scalar() or 0


def count_open_jobs(db: Session, owner: str | None) -> int:
    return _scoped_count(db, JobRequirement, owner, open_jobs_filter())


def count_active_candidates(db: Session, owner: str | None) -> int:
    return _scoped_count(db, Employee, owner, active_candidates_filter())


def count_submitted(db: Session, owner: str | None) -> int:
    return _scoped_count(db, Submission, owner, pipeline_group_filter("submitted"))


def count_interviews_scheduled(db: Session, owner: str | None) -> int:
    """Interview Scheduled = Interview-status submissions minus completed interviews.

    Same formula as the dashboard summary tile / pipeline overview split.
    """
    interview_subs_q = db.query(func.count(Submission.id)).filter(
        Submission.status.in_(list(_INTERVIEW_RAW))
    )
    if owner:
        interview_subs_q = interview_subs_q.filter(Submission.created_by == owner)
    interview_subs = interview_subs_q.scalar() or 0

    interview_completed_for_stage_q = (
        db.query(func.count(func.distinct(Interview.submission_id)))
        .join(Submission, Submission.id == Interview.submission_id)
        .filter(Submission.status.in_(list(_INTERVIEW_RAW)), Interview.status == "Completed")
    )
    if owner:
        interview_completed_for_stage_q = interview_completed_for_stage_q.filter(
            Submission.created_by == owner
        )
    interview_completed_for_stage = interview_completed_for_stage_q.scalar() or 0
    return max(0, interview_subs - min(interview_completed_for_stage, interview_subs))


def count_offers(db: Session, owner: str | None) -> int:
    return _scoped_count(db, Submission, owner, pipeline_group_filter("offer"))


def count_placements(db: Session, owner: str | None) -> int:
    return _scoped_count(db, Submission, owner, pipeline_group_filter("placed"))


def follow_ups_due_query(db: Session, owner: str | None):
    """Open follow-ups with a due_date — same recruiter scope as the dashboard."""
    q = db.query(CRMActivity).filter(
        CRMActivity.due_date.isnot(None),
        CRMActivity.status == "Open",
    )
    if owner:
        q = q.filter(
            or_(
                CRMActivity.assigned_to == owner,
                and_(CRMActivity.assigned_to.is_(None), CRMActivity.created_by == owner),
            )
        )
    return q


def count_follow_ups_due(db: Session, owner: str | None) -> int:
    return follow_ups_due_query(db, owner).count()
