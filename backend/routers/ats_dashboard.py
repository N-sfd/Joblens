"""ATS dashboard summary — accurate counts without loading full paginated lists."""

from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CRMActivity,
    CRMContact,
    CRMOrganization,
    Employee,
    ImportedEmail,
    Interview,
    JobEmployeeSend,
    JobRequirement,
    Offer,
    Submission,
    AtsDashboardStats,
    AtsDashboardRecentJob,
    AtsDashboardRecentEmployee,
    AtsDashboardDeadline,
    AtsDashboardEmailItem,
    AtsDashboardJobItem,
    AtsDashboardMatchItem,
    AtsDashboardActivityItem,
)
from ats_auth import AtsPrincipal, get_current_ats_user

router = APIRouter()

OPEN_JOB_STATUSES = {
    "New", "Needs Review", "Parsed", "Ready for Match", "Matched",
    "Sent to Employee", "Employee Interested", "Interested", "On Hold",
}
PENDING_MATCH_STATUSES = {"Ready for Match", "Parsed", "New"}
REVIEW_JOB_STATUSES = {"New", "Needs Review"}
ACTIVE_SUBMISSION_STATUSES = {
    "Draft", "Employee Contacted", "Employee Interested", "Submitted",
    "Client Review", "Interview", "Offer", "Selected",
}
ACTIVE_OFFER_STATUSES = {"Draft", "Extended", "Accepted"}
AVAILABLE_NOW_VALUES = {"Available Now", "Immediate", "Available", "Yes"}


def _employee_display_name(emp: Employee | None) -> str | None:
    if not emp:
        return None
    return " ".join(p for p in [emp.first_name, emp.last_name] if p).strip() or emp.name


@router.get("/dashboard", response_model=AtsDashboardStats)
async def get_dashboard_stats(
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    total_employees = db.query(func.count(Employee.id)).scalar() or 0
    active_employees = db.query(func.count(Employee.id)).filter(Employee.status == "Active").scalar() or 0
    bench_employees = db.query(func.count(Employee.id)).filter(Employee.status == "Bench").scalar() or 0
    available_now = (
        db.query(func.count(Employee.id))
        .filter(
            Employee.status.in_(("Active", "Bench")),
            or_(
                Employee.availability.in_(AVAILABLE_NOW_VALUES),
                Employee.availability.ilike("%available%"),
            ),
        )
        .scalar() or 0
    )

    open_jobs = db.query(func.count(JobRequirement.id)).filter(JobRequirement.status.in_(OPEN_JOB_STATUSES)).scalar() or 0
    new_jobs_today = (
        db.query(func.count(JobRequirement.id))
        .filter(JobRequirement.created_at >= today_start)
        .scalar() or 0
    )
    pending_matches = (
        db.query(func.count(JobRequirement.id))
        .filter(JobRequirement.status.in_(PENDING_MATCH_STATUSES))
        .scalar() or 0
    )
    submissions = (
        db.query(func.count(Submission.id))
        .filter(Submission.status.in_(ACTIVE_SUBMISSION_STATUSES))
        .scalar() or 0
    )
    pending_employee_responses = (
        db.query(func.count(JobEmployeeSend.id))
        .filter(
            JobEmployeeSend.delivery_status == "Sent",
            JobEmployeeSend.employee_response == "Pending",
        )
        .scalar() or 0
    )
    zoho_emails_awaiting_review = (
        db.query(func.count(ImportedEmail.id))
        .filter(or_(ImportedEmail.needs_review.is_(True), ImportedEmail.classification == "unclassified"))
        .scalar() or 0
    )
    interviews = (
        db.query(func.count(Interview.id))
        .filter(Interview.status.in_(("Scheduled", "Completed")))
        .scalar() or 0
    )
    offers = (
        db.query(func.count(Offer.id))
        .filter(Offer.status.in_(ACTIVE_OFFER_STATUSES))
        .scalar() or 0
    )

    new_email_jobs = (
        db.query(func.count(JobRequirement.id))
        .filter(or_(
            JobRequirement.source.ilike("%zoho%"),
            JobRequirement.source.ilike("%email%"),
        ))
        .scalar() or 0
    )

    organizations = db.query(func.count(CRMOrganization.id)).scalar() or 0
    contacts = db.query(func.count(CRMContact.id)).scalar() or 0

    recent_jobs = (
        db.query(JobRequirement)
        .order_by(JobRequirement.created_at.desc())
        .limit(6)
        .all()
    )
    recent_employees = (
        db.query(Employee)
        .order_by(Employee.created_at.desc())
        .limit(6)
        .all()
    )

    deadline_jobs = (
        db.query(JobRequirement)
        .filter(
            JobRequirement.status.in_(OPEN_JOB_STATUSES),
            JobRequirement.submission_deadline.isnot(None),
            JobRequirement.submission_deadline != "",
        )
        .order_by(JobRequirement.submission_deadline.asc())
        .limit(5)
        .all()
    )

    recent_zoho = (
        db.query(ImportedEmail)
        .filter(or_(ImportedEmail.classification == "job_req", ImportedEmail.needs_review.is_(True)))
        .order_by(ImportedEmail.imported_at.desc())
        .limit(6)
        .all()
    )

    jobs_needing_review = (
        db.query(JobRequirement)
        .filter(JobRequirement.status.in_(REVIEW_JOB_STATUSES))
        .order_by(JobRequirement.created_at.desc())
        .limit(6)
        .all()
    )

    top_sends = (
        db.query(JobEmployeeSend)
        .filter(JobEmployeeSend.match_score_at_send.isnot(None))
        .order_by(JobEmployeeSend.match_score_at_send.desc(), JobEmployeeSend.created_at.desc())
        .limit(6)
        .all()
    )
    top_matches: list[AtsDashboardMatchItem] = []
    for send in top_sends:
        job = db.query(JobRequirement).filter(JobRequirement.id == send.job_requirement_id).first()
        emp = db.query(Employee).filter(Employee.id == send.employee_id).first()
        top_matches.append(AtsDashboardMatchItem(
            job_requirement_id=send.job_requirement_id,
            employee_id=send.employee_id,
            job_title=job.job_title if job else None,
            employee_name=_employee_display_name(emp),
            match_score=send.match_score_at_send,
        ))

    recent_acts = (
        db.query(CRMActivity)
        .order_by(CRMActivity.activity_date.desc())
        .limit(6)
        .all()
    )

    return AtsDashboardStats(
        total_employees=total_employees,
        active_employees=active_employees,
        bench_employees=bench_employees,
        available_now=available_now,
        open_jobs=open_jobs,
        new_jobs_today=new_jobs_today,
        new_email_jobs=new_email_jobs,
        pending_matches=pending_matches,
        submissions=submissions,
        pending_employee_responses=pending_employee_responses,
        zoho_emails_awaiting_review=zoho_emails_awaiting_review,
        interviews=interviews,
        offers=offers,
        organizations=organizations,
        contacts=contacts,
        recent_jobs=[
            AtsDashboardRecentJob(id=j.id, job_title=j.job_title, vendor=j.vendor)
            for j in recent_jobs
        ],
        recent_employees=[
            AtsDashboardRecentEmployee(id=e.id, name=e.name, primary_skill=e.primary_skill)
            for e in recent_employees
        ],
        upcoming_deadlines=[
            AtsDashboardDeadline(
                id=j.id,
                job_title=j.job_title,
                submission_deadline=j.submission_deadline,
                vendor=j.vendor,
            )
            for j in deadline_jobs
        ],
        recent_zoho_emails=[
            AtsDashboardEmailItem(
                id=e.id,
                subject=e.subject,
                from_name=e.from_name or e.from_address,
                classification=e.classification,
                imported_at=e.imported_at,
            )
            for e in recent_zoho
        ],
        jobs_needing_review=[
            AtsDashboardJobItem(id=j.id, job_title=j.job_title, vendor=j.vendor, status=j.status)
            for j in jobs_needing_review
        ],
        top_matches=top_matches,
        recent_activities=[
            AtsDashboardActivityItem(
                id=a.id,
                activity_type=a.activity_type,
                subject=a.subject,
                activity_date=a.activity_date,
                status=a.status,
            )
            for a in recent_acts
        ],
    )
