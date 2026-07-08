"""ATS dashboard summary — accurate counts without loading full paginated lists."""

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CRMContact,
    CRMOrganization,
    Employee,
    JobRequirement,
    AtsDashboardStats,
    AtsDashboardRecentJob,
    AtsDashboardRecentEmployee,
)
from ats_auth import AtsPrincipal, get_current_ats_user

router = APIRouter()

OPEN_JOB_STATUSES = {
    "New", "Needs Review", "Parsed", "Ready for Match", "Matched",
    "Sent to Employee", "Employee Interested", "Interested", "On Hold",
}
PENDING_MATCH_STATUSES = {"Ready for Match", "Parsed", "New"}


@router.get("/dashboard", response_model=AtsDashboardStats)
async def get_dashboard_stats(
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    active_employees = db.query(func.count(Employee.id)).filter(Employee.status == "Active").scalar() or 0
    bench_employees = db.query(func.count(Employee.id)).filter(Employee.status == "Bench").scalar() or 0

    open_jobs = db.query(func.count(JobRequirement.id)).filter(JobRequirement.status.in_(OPEN_JOB_STATUSES)).scalar() or 0
    pending_matches = (
        db.query(func.count(JobRequirement.id))
        .filter(JobRequirement.status.in_(PENDING_MATCH_STATUSES))
        .scalar() or 0
    )
    submissions = db.query(func.count(JobRequirement.id)).filter(JobRequirement.status == "Submitted").scalar() or 0
    interviews = db.query(func.count(JobRequirement.id)).filter(JobRequirement.status == "Interview").scalar() or 0
    offers = db.query(func.count(JobRequirement.id)).filter(JobRequirement.status == "Selected").scalar() or 0

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

    return AtsDashboardStats(
        active_employees=active_employees,
        bench_employees=bench_employees,
        open_jobs=open_jobs,
        new_email_jobs=new_email_jobs,
        pending_matches=pending_matches,
        submissions=submissions,
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
    )
