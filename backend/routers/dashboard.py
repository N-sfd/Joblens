"""Unified Recruitment CRM + ATS dashboard — aggregated counts + feeds.

All numbers come from real database aggregation (no full-table loads, no demo
data). Role scoping is enforced here, not just hidden in the frontend:
Admin/Manager/Read Only see organization-wide data; Recruiter sees only
records they created (the closest existing proxy for "assigned to me" —
there is no separate ownership/assignment column on these tables yet).
"""

from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CRMActivity,
    CRMContact,
    CRMOrganization,
    DashboardActivityItem,
    DashboardFollowUpItem,
    DashboardPipelineStage,
    DashboardSummaryCounts,
    DashboardSummaryResponse,
    DashboardZohoJobItem,
    Employee,
    Interview,
    JobRequirement,
    Offer,
    Submission,
    ZohoConnection,
)
from ats_auth import AtsPrincipal, get_current_ats_user

router = APIRouter()

ORG_WIDE_ROLES = ("admin", "manager", "read_only")

# Terminal/dead job states excluded from "Open Jobs". Includes "Draft" and
# "Filled" pre-emptively — not yet real JobRequirement.status values in this
# codebase (that simplification lands in a later Jobs-module phase), but
# harmless to exclude now and correct automatically once they exist.
CLOSED_JOB_STATUSES = {"Closed", "Duplicate", "Spam", "Rejected", "Selected", "Draft", "Filled"}

SUBMITTED_OR_LATER_STATUSES = {"Submitted", "Client Review", "Interview", "Offer", "Selected"}
ACTIVE_OFFER_STATUSES = {"Draft", "Extended", "Accepted"}

PIPELINE_STAGE_ORDER = [
    "Identified", "Contacted", "Interested", "Submitted", "Client Review",
    "Interview Scheduled", "Interview Completed", "Offer", "Placed", "Rejected", "Withdrawn",
]
SUBMISSION_STATUS_TO_STAGE = {
    "Draft": "Identified",
    "Employee Contacted": "Contacted",
    "Employee Interested": "Interested",
    "Submitted": "Submitted",
    "Client Review": "Client Review",
    # "Interview" is split below using real Interview rows.
    "Offer": "Offer",
    "Selected": "Placed",
    "Rejected": "Rejected",
    "Withdrawn": "Withdrawn",
    # "Closed" has no equivalent in the target stage vocabulary — excluded.
}

NEW_JOB_WINDOW_DAYS = 7
RECENT_LIMIT = 10
FOLLOW_UP_LIMIT = 8
ZOHO_JOB_LIMIT = 8


def _scope_owner(principal: AtsPrincipal) -> str | None:
    """None = organization-wide; a Clerk user id = restrict to their own records."""
    if principal.role in ORG_WIDE_ROLES:
        return None
    return principal.user_id


def _employee_name(emp: Employee | None) -> str | None:
    if not emp:
        return None
    return " ".join(p for p in [emp.first_name, emp.last_name] if p).strip() or emp.name


def _contact_name(contact: CRMContact | None) -> str | None:
    if not contact:
        return None
    name = " ".join(p for p in [contact.first_name, contact.last_name] if p).strip()
    return name or contact.email


def _resolve_links(db: Session, rows: list) -> dict[str, dict[int, str | None]]:
    """Batch-resolve job/contact/org/employee display names for a bounded list."""
    job_ids = {r.job_requirement_id for r in rows if getattr(r, "job_requirement_id", None)}
    contact_ids = {r.contact_id for r in rows if getattr(r, "contact_id", None)}
    org_ids = {r.organization_id for r in rows if getattr(r, "organization_id", None)}
    emp_ids = {r.employee_id for r in rows if getattr(r, "employee_id", None)}

    jobs = {
        j.id: j.job_title
        for j in db.query(JobRequirement.id, JobRequirement.job_title).filter(JobRequirement.id.in_(job_ids)).all()
    } if job_ids else {}
    orgs = {
        o.id: o.organization_name
        for o in db.query(CRMOrganization.id, CRMOrganization.organization_name).filter(CRMOrganization.id.in_(org_ids)).all()
    } if org_ids else {}
    contacts = {
        c.id: _contact_name(c)
        for c in db.query(CRMContact).filter(CRMContact.id.in_(contact_ids)).all()
    } if contact_ids else {}
    employees = {
        e.id: _employee_name(e)
        for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()
    } if emp_ids else {}

    return {"jobs": jobs, "orgs": orgs, "contacts": contacts, "employees": employees}


@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    owner = _scope_owner(principal)
    now = datetime.utcnow()
    week_ago = now - timedelta(days=NEW_JOB_WINDOW_DAYS)

    def scoped_count(model, *filters):
        q = db.query(func.count(model.id)).filter(*filters)
        if owner:
            q = q.filter(model.created_by == owner)
        return q.scalar() or 0

    counts = DashboardSummaryCounts(
        open_jobs=scoped_count(JobRequirement, ~JobRequirement.status.in_(CLOSED_JOB_STATUSES)),
        new_zoho_jobs=scoped_count(
            JobRequirement,
            JobRequirement.source.ilike("%zoho%"),
            JobRequirement.created_at >= week_ago,
        ),
        active_candidates=scoped_count(Employee, Employee.status == "Active"),
        candidates_submitted=scoped_count(Submission, Submission.status.in_(SUBMITTED_OR_LATER_STATUSES)),
        interviews_scheduled=scoped_count(Interview, Interview.status == "Scheduled"),
        offers=scoped_count(Offer, Offer.status.in_(ACTIVE_OFFER_STATUSES)),
        placements=scoped_count(Submission, Submission.status == "Selected"),
        follow_ups_due=0,  # filled in below alongside the list, to share one filter
    )

    # --- Recent activity (unified across job/candidate/contact/submission) ---
    acts_q = db.query(CRMActivity).order_by(CRMActivity.activity_date.desc())
    if owner:
        acts_q = acts_q.filter(CRMActivity.created_by == owner)
    acts = acts_q.limit(RECENT_LIMIT).all()
    links = _resolve_links(db, acts)
    recent_activities = [
        DashboardActivityItem(
            id=a.id,
            activity_type=a.activity_type,
            subject=a.subject,
            description=a.description,
            activity_date=a.activity_date,
            created_by=a.created_by,
            job_requirement_id=a.job_requirement_id,
            job_title=links["jobs"].get(a.job_requirement_id) if a.job_requirement_id else None,
            contact_id=a.contact_id,
            contact_name=links["contacts"].get(a.contact_id) if a.contact_id else None,
            organization_id=a.organization_id,
            organization_name=links["orgs"].get(a.organization_id) if a.organization_id else None,
            employee_id=a.employee_id,
            employee_name=links["employees"].get(a.employee_id) if a.employee_id else None,
            submission_id=a.submission_id,
        )
        for a in acts
    ]

    # --- Follow-ups due (CRMActivity rows with a due_date, status=Open) ---
    follow_ups_q = db.query(CRMActivity).filter(CRMActivity.due_date.isnot(None), CRMActivity.status == "Open")
    if owner:
        follow_ups_q = follow_ups_q.filter(
            or_(CRMActivity.assigned_to == owner, and_(CRMActivity.assigned_to.is_(None), CRMActivity.created_by == owner))
        )
    counts.follow_ups_due = follow_ups_q.count()
    follow_up_rows = follow_ups_q.order_by(CRMActivity.due_date.asc()).limit(FOLLOW_UP_LIMIT).all()
    fu_links = _resolve_links(db, follow_up_rows)
    follow_ups_due = [
        DashboardFollowUpItem(
            id=a.id,
            subject=a.subject or a.activity_type,
            due_date=a.due_date,
            overdue=bool(a.due_date and a.due_date < now),
            job_requirement_id=a.job_requirement_id,
            job_title=fu_links["jobs"].get(a.job_requirement_id) if a.job_requirement_id else None,
            contact_id=a.contact_id,
            contact_name=fu_links["contacts"].get(a.contact_id) if a.contact_id else None,
            organization_id=a.organization_id,
            organization_name=fu_links["orgs"].get(a.organization_id) if a.organization_id else None,
            employee_id=a.employee_id,
            employee_name=fu_links["employees"].get(a.employee_id) if a.employee_id else None,
        )
        for a in follow_up_rows
    ]

    # --- Recent Zoho-imported jobs ---
    zoho_jobs_q = db.query(JobRequirement).filter(JobRequirement.source.ilike("%zoho%")).order_by(
        JobRequirement.created_at.desc()
    )
    if owner:
        zoho_jobs_q = zoho_jobs_q.filter(JobRequirement.created_by == owner)
    recent_zoho_jobs = [
        DashboardZohoJobItem(
            id=j.id,
            job_title=j.job_title,
            recruiter_name=j.recruiter_name,
            company=j.client or j.vendor,
            received_at=j.received_at,
            review_status=j.review_status or "Draft",
            status=j.status,
        )
        for j in zoho_jobs_q.limit(ZOHO_JOB_LIMIT).all()
    ]

    # --- Pipeline overview (real Submission data, mapped to the target stage set) ---
    sub_status_q = db.query(Submission.status, func.count(Submission.id)).group_by(Submission.status)
    if owner:
        sub_status_q = sub_status_q.filter(Submission.created_by == owner)
    raw_counts = dict(sub_status_q.all())

    interview_completed_q = (
        db.query(func.count(func.distinct(Interview.submission_id)))
        .join(Submission, Submission.id == Interview.submission_id)
        .filter(Submission.status == "Interview", Interview.status == "Completed")
    )
    if owner:
        interview_completed_q = interview_completed_q.filter(Submission.created_by == owner)
    interview_completed = interview_completed_q.scalar() or 0

    stage_counts = {stage: 0 for stage in PIPELINE_STAGE_ORDER}
    for raw_status, count in raw_counts.items():
        if raw_status == "Interview":
            completed = min(interview_completed, count)
            stage_counts["Interview Completed"] += completed
            stage_counts["Interview Scheduled"] += count - completed
            continue
        stage = SUBMISSION_STATUS_TO_STAGE.get(raw_status)
        if stage:
            stage_counts[stage] += count
    pipeline = [DashboardPipelineStage(stage=s, count=stage_counts[s]) for s in PIPELINE_STAGE_ORDER]

    zoho_connected = (
        db.query(ZohoConnection)
        .filter(ZohoConnection.status == "Active", ZohoConnection.encrypted_refresh_token.isnot(None))
        .first()
        is not None
    )

    return DashboardSummaryResponse(
        scope="own" if owner else "organization",
        zoho_connected=zoho_connected,
        counts=counts,
        recent_activities=recent_activities,
        follow_ups_due=follow_ups_due,
        recent_zoho_jobs=recent_zoho_jobs,
        pipeline=pipeline,
    )
