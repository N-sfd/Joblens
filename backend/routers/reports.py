"""Phase 7 Reports — scoped aggregates + CSV export.

Shared count helpers live in services.metric_counts so Dashboard and Reports
snapshot tiles never diverge. Date presets resolve to UTC day boundaries.
"""

from __future__ import annotations

import csv
import io
from datetime import date, datetime, time, timedelta
from typing import Any, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, Query as SAQuery

from ats_auth import AtsPrincipal, get_current_ats_user
from database import get_db
from models import (
    CRMActivity,
    CRMContact,
    CRMOrganization,
    Employee,
    Interview,
    JobRequirement,
    Offer,
    ReportDateRange,
    ReportEnvelope,
    Submission,
)
from services.candidate_status import (
    CANDIDATE_STATUS_GROUPS,
    normalize_candidate_status,
)
from services.job_status import (
    JOB_STATUS_GROUPS,
    normalize_job_status,
    normalize_source_label,
    raw_statuses_matching_group as job_raw_statuses_matching_group,
    _ALL_KNOWN_RAW_STATUSES,
)
from services.metric_counts import (
    count_active_candidates,
    count_follow_ups_due,
    count_interviews_scheduled,
    count_offers,
    count_open_jobs,
    count_placements,
    count_submitted,
    follow_ups_due_query,
    pipeline_group_filter,
    scope_owner,
)
from services.pipeline_status import (
    PIPELINE_STAGES,
    normalize_pipeline_stage,
)

router = APIRouter()

VALID_PRESETS = (
    "today",
    "last_7_days",
    "last_30_days",
    "this_month",
    "last_month",
    "this_quarter",
    "this_year",
    "custom",
)

REPORT_TYPES = (
    "overview",
    "jobs",
    "candidates",
    "pipeline",
    "contacts",
    "activity",
    "follow-ups",
)

AGING_BUCKETS = ("0-7", "8-14", "15-30", "31-60", "60+")

CANDIDATE_SOURCE_LABELS = (
    "Resume Upload",
    "Manual",
    "Referral",
    "Zoho",
    "API",
    "Other",
)


# ---------------------------------------------------------------------------
# Date / filter helpers
# ---------------------------------------------------------------------------


def _utc_day_start(d: date) -> datetime:
    return datetime.combine(d, time.min)


def _utc_day_end(d: date) -> datetime:
    return datetime.combine(d, time.max).replace(microsecond=999999)


def _parse_date_param(value: str | None, *, end: bool = False) -> datetime | None:
    if not value or not str(value).strip():
        return None
    raw = str(value).strip()
    try:
        if "T" in raw or " " in raw:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if dt.tzinfo is not None:
                dt = dt.replace(tzinfo=None)
            return dt
        d = date.fromisoformat(raw[:10])
        return _utc_day_end(d) if end else _utc_day_start(d)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid date value: {value}") from exc


def resolve_date_range(
    preset: str,
    date_from: str | None,
    date_to: str | None,
    *,
    now: datetime | None = None,
) -> tuple[datetime, datetime, str]:
    """Resolve preset / custom dates to inclusive UTC day-boundary range."""
    now = now or datetime.utcnow()
    today = now.date()
    p = (preset or "last_30_days").strip().lower()
    if p not in VALID_PRESETS:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid preset. Expected one of: {', '.join(VALID_PRESETS)}",
        )

    if p == "custom":
        df = _parse_date_param(date_from, end=False)
        dt = _parse_date_param(date_to, end=True)
        if df is None or dt is None:
            raise HTTPException(
                status_code=422,
                detail="custom preset requires date_from and date_to",
            )
    elif p == "today":
        df, dt = _utc_day_start(today), _utc_day_end(today)
    elif p == "last_7_days":
        df, dt = _utc_day_start(today - timedelta(days=6)), _utc_day_end(today)
    elif p == "last_30_days":
        df, dt = _utc_day_start(today - timedelta(days=29)), _utc_day_end(today)
    elif p == "this_month":
        df, dt = _utc_day_start(today.replace(day=1)), _utc_day_end(today)
    elif p == "last_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        df = _utc_day_start(last_prev.replace(day=1))
        dt = _utc_day_end(last_prev)
    elif p == "this_quarter":
        q_month = ((today.month - 1) // 3) * 3 + 1
        df = _utc_day_start(date(today.year, q_month, 1))
        dt = _utc_day_end(today)
    elif p == "this_year":
        df, dt = _utc_day_start(date(today.year, 1, 1)), _utc_day_end(today)
    else:
        df, dt = _utc_day_start(today - timedelta(days=29)), _utc_day_end(today)

    if date_from and p != "custom":
        override = _parse_date_param(date_from, end=False)
        if override is not None:
            df = override
    if date_to and p != "custom":
        override = _parse_date_param(date_to, end=True)
        if override is not None:
            dt = override

    if df > dt:
        raise HTTPException(status_code=422, detail="date_from must be on or before date_to")
    return df, dt, p


def _filters_dict(**kwargs) -> dict[str, Any]:
    return {k: v for k, v in kwargs.items() if v is not None and v != ""}


def _apply_owner(q: SAQuery, model, owner: str | None):
    if owner:
        return q.filter(model.created_by == owner)
    return q


def _job_status_sql_filter(status: str | None):
    if not status:
        return None
    statuses, includes_unmapped = job_raw_statuses_matching_group(status)
    if includes_unmapped:
        return or_(
            JobRequirement.status.in_(list(statuses)),
            ~JobRequirement.status.in_(_ALL_KNOWN_RAW_STATUSES),
        )
    return JobRequirement.status.in_(list(statuses))


def _apply_job_filters(
    q: SAQuery,
    *,
    owner: str | None,
    recruiter_contact_id: int | None = None,
    client_id: int | None = None,
    organization_id: int | None = None,
    job_id: int | None = None,
    job_source: str | None = None,
    job_status: str | None = None,
) -> SAQuery:
    q = _apply_owner(q, JobRequirement, owner)
    if job_id is not None:
        q = q.filter(JobRequirement.id == job_id)
    if recruiter_contact_id is not None:
        q = q.filter(JobRequirement.recruiter_contact_id == recruiter_contact_id)
    org = client_id if client_id is not None else organization_id
    if org is not None:
        q = q.filter(
            or_(
                JobRequirement.client_id == org,
                JobRequirement.vendor_id == org,
                JobRequirement.end_client_id == org,
            )
        )
    if job_source:
        q = q.filter(JobRequirement.source.ilike(f"%{job_source}%"))
    status_f = _job_status_sql_filter(job_status)
    if status_f is not None:
        q = q.filter(status_f)
    return q


def _apply_submission_filters(
    q: SAQuery,
    *,
    owner: str | None,
    recruiter_contact_id: int | None = None,
    client_id: int | None = None,
    organization_id: int | None = None,
    job_id: int | None = None,
    job_source: str | None = None,
    job_status: str | None = None,
    stage_group: str | None = None,
    stage: str | None = None,
    join_job: bool = False,
) -> SAQuery:
    need_job = bool(client_id or organization_id or job_source or job_status or join_job)
    if need_job:
        q = q.join(JobRequirement, JobRequirement.id == Submission.job_requirement_id)
        q = _apply_job_filters(
            q,
            owner=None,  # ownership is on Submission
            recruiter_contact_id=None,
            client_id=client_id,
            organization_id=organization_id,
            job_id=None,
            job_source=job_source,
            job_status=job_status,
        )
    q = _apply_owner(q, Submission, owner)
    if job_id is not None:
        q = q.filter(Submission.job_requirement_id == job_id)
    if recruiter_contact_id is not None:
        if need_job:
            q = q.filter(
                or_(
                    Submission.recruiter_contact_id == recruiter_contact_id,
                    JobRequirement.recruiter_contact_id == recruiter_contact_id,
                )
            )
        else:
            q = q.filter(Submission.recruiter_contact_id == recruiter_contact_id)
    if stage_group:
        q = q.filter(pipeline_group_filter(stage_group))
    elif stage:
        q = q.filter(pipeline_group_filter(stage))
    return q


def _apply_employee_filters(
    q: SAQuery,
    *,
    owner: str | None,
    candidate_source: str | None = None,
) -> SAQuery:
    q = _apply_owner(q, Employee, owner)
    if candidate_source:
        q = q.filter(Employee.source.ilike(f"%{candidate_source}%"))
    return q


def _apply_activity_filters(
    q: SAQuery,
    *,
    owner: str | None,
    recruiter_contact_id: int | None = None,
    client_id: int | None = None,
    organization_id: int | None = None,
    job_id: int | None = None,
) -> SAQuery:
    if owner:
        q = q.filter(
            or_(
                CRMActivity.assigned_to == owner,
                and_(CRMActivity.assigned_to.is_(None), CRMActivity.created_by == owner),
            )
        )
    if recruiter_contact_id is not None:
        q = q.filter(CRMActivity.contact_id == recruiter_contact_id)
    org = client_id if client_id is not None else organization_id
    if org is not None:
        q = q.filter(CRMActivity.organization_id == org)
    if job_id is not None:
        q = q.filter(CRMActivity.job_requirement_id == job_id)
    return q


def _in_range(column, date_from: datetime, date_to: datetime):
    return and_(column.isnot(None), column >= date_from, column <= date_to)


def _age_bucket(days: int) -> str:
    if days <= 7:
        return "0-7"
    if days <= 14:
        return "8-14"
    if days <= 30:
        return "15-30"
    if days <= 60:
        return "31-60"
    return "60+"


def _empty_aging() -> dict[str, int]:
    return {b: 0 for b in AGING_BUCKETS}


def _pct(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100.0, 1)


def _normalize_candidate_source(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return "Other"
    low = str(raw).strip().lower()
    if "resume" in low or "upload" in low:
        return "Resume Upload"
    if "manual" in low or "paste" in low:
        return "Manual"
    if "refer" in low:
        return "Referral"
    if "zoho" in low:
        return "Zoho"
    if "api" in low:
        return "API"
    return "Other"


def _employee_name(emp: Employee | None) -> str | None:
    if not emp:
        return None
    return " ".join(p for p in [emp.first_name, emp.last_name] if p).strip() or emp.name


def _contact_name(contact: CRMContact | None) -> str | None:
    if not contact:
        return None
    name = " ".join(p for p in [contact.first_name, contact.last_name] if p).strip()
    return name or contact.email


def _envelope(
    *,
    report_type: str,
    scope: str,
    date_from: datetime,
    date_to: datetime,
    preset: str,
    date_basis: dict[str, str],
    filters_applied: dict[str, Any],
    summary: dict[str, Any] | None = None,
    sections: dict[str, Any] | None = None,
    rows: list[dict[str, Any]] | None = None,
) -> ReportEnvelope:
    return ReportEnvelope(
        report_type=report_type,
        scope=scope,
        generated_at=datetime.utcnow(),
        date_range=ReportDateRange(preset=preset, date_from=date_from, date_to=date_to),
        date_basis=date_basis,
        filters_applied=filters_applied,
        summary=summary or {},
        sections=sections or {},
        rows=rows or [],
    )



def _resolve_scope_owner(principal: AtsPrincipal, owner_override: str | None) -> str | None:
    base = scope_owner(principal)
    if base is not None:
        return base  # recruiters cannot widen
    if owner_override:
        return owner_override
    return None


# ---------------------------------------------------------------------------
# Pipeline stage counts (current snapshot)
# ---------------------------------------------------------------------------


def _pipeline_stage_counts(db: Session, owner: str | None, **job_filters) -> dict[str, int]:
    q = db.query(Submission.status, func.count(Submission.id)).group_by(Submission.status)
    q = _apply_submission_filters(q, owner=owner, **{k: v for k, v in job_filters.items() if k != "candidate_source"})
    raw_counts = dict(q.all())

    interview_completed_q = (
        db.query(func.count(func.distinct(Interview.submission_id)))
        .join(Submission, Submission.id == Interview.submission_id)
        .filter(Submission.status == "Interview", Interview.status == "Completed")
    )
    interview_completed_q = _apply_owner(interview_completed_q, Submission, owner)
    interview_completed = interview_completed_q.scalar() or 0

    stage_counts = {stage: 0 for stage in PIPELINE_STAGES}
    for raw_status, count in raw_counts.items():
        if raw_status == "Interview":
            completed = min(interview_completed, count)
            stage_counts["Interview Completed"] += completed
            stage_counts["Interview Scheduled"] += count - completed
            continue
        stage = normalize_pipeline_stage(raw_status)
        if stage in stage_counts:
            stage_counts[stage] += count
    return stage_counts


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/overview", response_model=ReportEnvelope)
async def reports_overview(
    preset: str = Query("last_30_days"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    recruiter_contact_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    organization_id: Optional[int] = Query(None),
    job_id: Optional[int] = Query(None),
    job_source: Optional[str] = Query(None),
    job_status: Optional[str] = Query(None),
    candidate_source: Optional[str] = Query(None),
    stage_group: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    df, dt, resolved_preset = resolve_date_range(preset, date_from, date_to)
    scoped = _resolve_scope_owner(principal, owner)
    filters = _filters_dict(
        owner=owner,
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
        job_source=job_source,
        job_status=job_status,
        candidate_source=candidate_source,
        stage_group=stage_group,
        stage=stage,
    )
    job_kw = dict(
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
        job_source=job_source,
        job_status=job_status,
    )

    # Period metrics
    jobs_created_q = db.query(func.count(JobRequirement.id)).filter(
        _in_range(JobRequirement.created_at, df, dt)
    )
    jobs_created_q = _apply_job_filters(jobs_created_q, owner=scoped, **job_kw)
    jobs_created = jobs_created_q.scalar() or 0

    cand_added_q = db.query(func.count(Employee.id)).filter(_in_range(Employee.created_at, df, dt))
    cand_added_q = _apply_employee_filters(cand_added_q, owner=scoped, candidate_source=candidate_source)
    candidates_added = cand_added_q.scalar() or 0

    # Candidates submitted: prefer submission_date in range, else created_at
    submitted_in_range_q = db.query(func.count(Submission.id)).filter(
        or_(
            _in_range(Submission.submission_date, df, dt),
            and_(Submission.submission_date.is_(None), _in_range(Submission.created_at, df, dt)),
        ),
        pipeline_group_filter("submitted"),
    )
    submitted_in_range_q = _apply_submission_filters(
        submitted_in_range_q, owner=scoped, stage_group=None, stage=None, **job_kw
    )
    candidates_submitted_period = submitted_in_range_q.scalar() or 0

    # Interviews completed in range (scheduled_at or updated_at)
    iv_q = (
        db.query(func.count(Interview.id))
        .join(Submission, Submission.id == Interview.submission_id)
        .filter(
            Interview.status == "Completed",
            or_(
                _in_range(Interview.scheduled_at, df, dt),
                and_(Interview.scheduled_at.is_(None), _in_range(Interview.updated_at, df, dt)),
            ),
        )
    )
    iv_q = _apply_owner(iv_q, Submission, scoped)
    if job_id is not None:
        iv_q = iv_q.filter(Submission.job_requirement_id == job_id)
    interviews_completed = iv_q.scalar() or 0

    # Offers extended: Offer Extended/Accepted in range OR current offer-stage count
    offer_rows_q = (
        db.query(func.count(Offer.id))
        .join(Submission, Submission.id == Offer.submission_id)
        .filter(
            Offer.status.in_(["Extended", "Accepted"]),
            or_(
                _in_range(Offer.offer_date, df, dt),
                and_(Offer.offer_date.is_(None), _in_range(Offer.created_at, df, dt)),
            ),
        )
    )
    offer_rows_q = _apply_owner(offer_rows_q, Submission, scoped)
    offers_from_table = offer_rows_q.scalar() or 0
    offers_extended = offers_from_table if offers_from_table else count_offers(db, scoped)

    overdue_q = follow_ups_due_query(db, scoped).filter(CRMActivity.due_date < datetime.utcnow())
    overdue_follow_ups = overdue_q.count()

    stage_counts = _pipeline_stage_counts(db, scoped, **job_kw, stage_group=stage_group, stage=stage)

    # jobs_by_status snapshot
    job_rows_q = db.query(JobRequirement.status, func.count(JobRequirement.id)).group_by(JobRequirement.status)
    job_rows_q = _apply_job_filters(job_rows_q, owner=scoped, **job_kw)
    jobs_by_status = {g: 0 for g in JOB_STATUS_GROUPS}
    for raw, cnt in job_rows_q.all():
        display = normalize_job_status(raw)
        if display in jobs_by_status:
            jobs_by_status[display] += cnt

    # activity_by_type in range
    act_q = (
        db.query(CRMActivity.activity_type, func.count(CRMActivity.id))
        .filter(_in_range(CRMActivity.activity_date, df, dt))
        .group_by(CRMActivity.activity_type)
    )
    act_q = _apply_activity_filters(
        act_q,
        owner=scoped,
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
    )
    activity_by_type = [{"activity_type": t or "Other", "count": c} for t, c in act_q.all()]

    # top clients / recruiters by jobs created in period
    top_clients_q = (
        db.query(JobRequirement.client_id, func.count(JobRequirement.id))
        .filter(JobRequirement.client_id.isnot(None), _in_range(JobRequirement.created_at, df, dt))
    )
    top_clients_q = _apply_owner(top_clients_q, JobRequirement, scoped)
    top_client_rows = (
        top_clients_q.group_by(JobRequirement.client_id)
        .order_by(func.count(JobRequirement.id).desc())
        .limit(10)
        .all()
    )
    client_ids = [r[0] for r in top_client_rows]
    org_names = {
        o.id: o.organization_name
        for o in db.query(CRMOrganization).filter(CRMOrganization.id.in_(client_ids)).all()
    } if client_ids else {}
    top_clients = [
        {"organization_id": cid, "organization_name": org_names.get(cid), "job_count": cnt}
        for cid, cnt in top_client_rows
    ]

    top_recs_q = (
        db.query(JobRequirement.recruiter_contact_id, func.count(JobRequirement.id))
        .filter(
            JobRequirement.recruiter_contact_id.isnot(None),
            _in_range(JobRequirement.created_at, df, dt),
        )
    )
    top_recs_q = _apply_owner(top_recs_q, JobRequirement, scoped)
    rec_rows = (
        top_recs_q.group_by(JobRequirement.recruiter_contact_id)
        .order_by(func.count(JobRequirement.id).desc())
        .limit(10)
        .all()
    )
    rec_ids = [r[0] for r in rec_rows]
    contacts = {
        c.id: _contact_name(c)
        for c in db.query(CRMContact).filter(CRMContact.id.in_(rec_ids)).all()
    } if rec_ids else {}
    top_recruiters = [
        {"contact_id": cid, "contact_name": contacts.get(cid), "job_count": cnt}
        for cid, cnt in rec_rows
    ]

    summary = {
        "jobs_created": jobs_created,
        "open_jobs": count_open_jobs(db, scoped),
        "candidates_added": candidates_added,
        "active_candidates": count_active_candidates(db, scoped),
        "candidates_submitted": candidates_submitted_period
        if candidates_submitted_period
        else count_submitted(db, scoped),
        "candidates_submitted_current": count_submitted(db, scoped),
        "interviews_completed": interviews_completed,
        "interviews_scheduled": count_interviews_scheduled(db, scoped),
        "offers_extended": offers_extended,
        "offers": count_offers(db, scoped),
        "placements": count_placements(db, scoped),
        "overdue_follow_ups": overdue_follow_ups,
        "follow_ups_due": count_follow_ups_due(db, scoped),
    }

    return _envelope(
        report_type="overview",
        scope="own" if scoped else "organization",
        date_from=df,
        date_to=dt,
        preset=resolved_preset,
        date_basis={
            "jobs_created": "JobRequirement.created_at in range",
            "open_jobs": "Current snapshot (same as dashboard)",
            "candidates_added": "Employee.created_at in range",
            "candidates_submitted": "Submission.submission_date or created_at in range; falls back to current submitted stage",
            "interviews_completed": "Interview.status=Completed; scheduled_at or updated_at in range",
            "offers_extended": "Offer Extended/Accepted in range; else current offer-stage snapshot",
            "placements": "Current snapshot (same as dashboard)",
            "overdue_follow_ups": "Open activities with due_date < now",
            "pipeline_stages": "Current submission stage snapshot",
            "activity_by_type": "CRMActivity.activity_date in range",
            "top_clients": "Jobs with client_id created in range",
            "top_recruiters": "Jobs with recruiter_contact_id created in range",
        },
        filters_applied=filters,
        summary=summary,
        sections={
            "pipeline_stages": [{"stage": s, "count": stage_counts[s]} for s in PIPELINE_STAGES],
            "jobs_by_status": [{"status": s, "count": jobs_by_status[s]} for s in JOB_STATUS_GROUPS],
            "activity_by_type": activity_by_type,
            "top_clients": top_clients,
            "top_recruiters": top_recruiters,
        },
    )


@router.get("/jobs", response_model=ReportEnvelope)
async def reports_jobs(
    preset: str = Query("last_30_days"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    recruiter_contact_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    organization_id: Optional[int] = Query(None),
    job_id: Optional[int] = Query(None),
    job_source: Optional[str] = Query(None),
    job_status: Optional[str] = Query(None),
    candidate_source: Optional[str] = Query(None),
    stage_group: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    df, dt, resolved_preset = resolve_date_range(preset, date_from, date_to)
    scoped = _resolve_scope_owner(principal, owner)
    filters = _filters_dict(
        owner=owner,
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
        job_source=job_source,
        job_status=job_status,
    )
    job_kw = dict(
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
        job_source=job_source,
        job_status=job_status,
    )
    now = datetime.utcnow()

    jobs_q = db.query(JobRequirement)
    jobs_q = _apply_job_filters(jobs_q, owner=scoped, **job_kw)
    # Prefer period-created jobs for period sections, but aging uses current open
    period_jobs = jobs_q.filter(_in_range(JobRequirement.created_at, df, dt)).all()
    all_jobs = jobs_q.all()

    by_status = {g: {"status": g, "count": 0, "submissions": 0, "interviews": 0, "offers": 0, "placements": 0} for g in JOB_STATUS_GROUPS}
    by_source: dict[str, int] = {}
    by_recruiter: dict[int | None, dict[str, Any]] = {}
    by_client: dict[int | None, dict[str, Any]] = {}

    for job in period_jobs or all_jobs:
        display = normalize_job_status(job.status)
        if display in by_status:
            by_status[display]["count"] += 1
        src = normalize_source_label(job.source)
        by_source[src] = by_source.get(src, 0) + 1
        rid = job.recruiter_contact_id
        if rid not in by_recruiter:
            by_recruiter[rid] = {"recruiter_contact_id": rid, "count": 0}
        by_recruiter[rid]["count"] += 1
        cid = job.client_id
        if cid not in by_client:
            by_client[cid] = {"client_id": cid, "count": 0}
        by_client[cid]["count"] += 1

    # Attach contact/org names
    rec_ids = [k for k in by_recruiter if k]
    contacts = {
        c.id: _contact_name(c)
        for c in db.query(CRMContact).filter(CRMContact.id.in_(rec_ids)).all()
    } if rec_ids else {}
    for rid, row in by_recruiter.items():
        row["recruiter_name"] = contacts.get(rid) if rid else None

    client_ids = [k for k in by_client if k]
    orgs = {
        o.id: o.organization_name
        for o in db.query(CRMOrganization).filter(CRMOrganization.id.in_(client_ids)).all()
    } if client_ids else {}
    for cid, row in by_client.items():
        row["client_name"] = orgs.get(cid) if cid else None

    aging = _empty_aging()
    open_hold = {
        j for j in all_jobs
        if normalize_job_status(j.status) in ("Open", "On Hold")
    }
    for job in open_hold:
        anchor = job.received_at or job.created_at or now
        days = max(0, (now - anchor).days)
        aging[_age_bucket(days)] += 1

    return _envelope(
        report_type="jobs",
        scope="own" if scoped else "organization",
        date_from=df,
        date_to=dt,
        preset=resolved_preset,
        date_basis={
            "by_status": "Jobs created in range (falls back to all scoped jobs if none)",
            "by_source": "normalize_source_label on job.source",
            "aging_open": "Current Open/On Hold; age from received_at or created_at",
        },
        filters_applied=filters,
        summary={"total_jobs": len(period_jobs) or len(all_jobs), "open_jobs": count_open_jobs(db, scoped)},
        sections={
            "by_status": list(by_status.values()),
            "by_source": [{"source": s, "count": c} for s, c in sorted(by_source.items())],
            "by_recruiter": sorted(by_recruiter.values(), key=lambda r: -r["count"]),
            "by_client": sorted(by_client.values(), key=lambda r: -r["count"]),
            "aging_open": [{"bucket": b, "count": aging[b]} for b in AGING_BUCKETS],
        },
        rows=[],
    )


@router.get("/candidates", response_model=ReportEnvelope)
async def reports_candidates(
    preset: str = Query("last_30_days"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    candidate_source: Optional[str] = Query(None),
    recruiter_contact_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    organization_id: Optional[int] = Query(None),
    job_id: Optional[int] = Query(None),
    job_source: Optional[str] = Query(None),
    job_status: Optional[str] = Query(None),
    stage_group: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    df, dt, resolved_preset = resolve_date_range(preset, date_from, date_to)
    scoped = _resolve_scope_owner(principal, owner)
    filters = _filters_dict(owner=owner, candidate_source=candidate_source)
    now = datetime.utcnow()

    emp_q = db.query(Employee)
    emp_q = _apply_employee_filters(emp_q, owner=scoped, candidate_source=candidate_source)
    employees = emp_q.all()

    by_status = {g: 0 for g in CANDIDATE_STATUS_GROUPS}
    by_source = {s: 0 for s in CANDIDATE_SOURCE_LABELS}
    aging = _empty_aging()

    for emp in employees:
        display = normalize_candidate_status(emp.status)
        if display in by_status:
            by_status[display] += 1
        src = _normalize_candidate_source(emp.source)
        by_source[src] = by_source.get(src, 0) + 1
        if normalize_candidate_status(emp.status) in ("Inactive", "Rejected"):
            anchor = emp.updated_at or emp.created_at or now
            days = max(0, (now - anchor).days)
            aging[_age_bucket(days)] += 1

    act_q = (
        db.query(CRMActivity.activity_type, func.count(CRMActivity.id))
        .filter(
            CRMActivity.employee_id.isnot(None),
            _in_range(CRMActivity.activity_date, df, dt),
        )
        .group_by(CRMActivity.activity_type)
    )
    act_q = _apply_activity_filters(act_q, owner=scoped)
    activity_counts = [{"activity_type": t or "Other", "count": c} for t, c in act_q.all()]

    return _envelope(
        report_type="candidates",
        scope="own" if scoped else "organization",
        date_from=df,
        date_to=dt,
        preset=resolved_preset,
        date_basis={
            "by_status": "Current candidate status snapshot (normalize_candidate_status)",
            "by_source": "Normalized candidate source label",
            "activity_counts": "CRMActivity.activity_date in range linked to employee_id",
            "aging_inactive": "Inactive/Rejected candidates; age from updated_at",
        },
        filters_applied=filters,
        summary={"total_candidates": len(employees)},
        sections={
            "by_status": [{"status": s, "count": by_status[s]} for s in CANDIDATE_STATUS_GROUPS],
            "by_source": [{"source": s, "count": by_source[s]} for s in CANDIDATE_SOURCE_LABELS],
            "activity_counts": activity_counts,
            "aging_inactive": [{"bucket": b, "count": aging[b]} for b in AGING_BUCKETS],
        },
    )


@router.get("/pipeline", response_model=ReportEnvelope)
async def reports_pipeline(
    preset: str = Query("last_30_days"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    recruiter_contact_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    organization_id: Optional[int] = Query(None),
    job_id: Optional[int] = Query(None),
    job_source: Optional[str] = Query(None),
    job_status: Optional[str] = Query(None),
    candidate_source: Optional[str] = Query(None),
    stage_group: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    df, dt, resolved_preset = resolve_date_range(preset, date_from, date_to)
    scoped = _resolve_scope_owner(principal, owner)
    filters = _filters_dict(
        owner=owner,
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
        job_source=job_source,
        job_status=job_status,
        stage_group=stage_group,
        stage=stage,
    )
    job_kw = dict(
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
        job_source=job_source,
        job_status=job_status,
        stage_group=stage_group,
        stage=stage,
    )

    stage_counts = _pipeline_stage_counts(db, scoped, **job_kw)
    identified = stage_counts.get("Identified", 0)
    submitted = stage_counts.get("Submitted", 0) + stage_counts.get("Client Review", 0)
    interview = stage_counts.get("Interview Scheduled", 0) + stage_counts.get("Interview Completed", 0)
    offer = stage_counts.get("Offer", 0)
    placed = stage_counts.get("Placed", 0)

    conversion = [
        {
            "from_stage": "Identified",
            "to_stage": "Submitted",
            "from_count": identified,
            "to_count": submitted,
            "rate_pct": _pct(submitted, identified),
        },
        {
            "from_stage": "Submitted",
            "to_stage": "Interview",
            "from_count": submitted,
            "to_count": interview,
            "rate_pct": _pct(interview, submitted),
        },
        {
            "from_stage": "Interview",
            "to_stage": "Offer",
            "from_count": interview,
            "to_count": offer,
            "rate_pct": _pct(offer, interview),
        },
        {
            "from_stage": "Offer",
            "to_stage": "Placed",
            "from_count": offer,
            "to_count": placed,
            "rate_pct": _pct(placed, offer),
        },
        {
            "from_stage": "Submitted",
            "to_stage": "Placed",
            "from_count": submitted,
            "to_count": placed,
            "rate_pct": _pct(placed, submitted),
        },
    ]

    iv_status_q = (
        db.query(Interview.status, func.count(Interview.id))
        .join(Submission, Submission.id == Interview.submission_id)
        .group_by(Interview.status)
    )
    iv_status_q = _apply_owner(iv_status_q, Submission, scoped)
    if job_id is not None:
        iv_status_q = iv_status_q.filter(Submission.job_requirement_id == job_id)
    interview_status = [{"status": s or "Unknown", "count": c} for s, c in iv_status_q.all()]

    offer_status_q = (
        db.query(Offer.status, func.count(Offer.id))
        .join(Submission, Submission.id == Offer.submission_id)
        .group_by(Offer.status)
    )
    offer_status_q = _apply_owner(offer_status_q, Submission, scoped)
    if job_id is not None:
        offer_status_q = offer_status_q.filter(Submission.job_requirement_id == job_id)
    offer_status = [{"status": s or "Unknown", "count": c} for s, c in offer_status_q.all()]

    placed_q = db.query(Submission).filter(pipeline_group_filter("placed"))
    placed_q = _apply_submission_filters(placed_q, owner=scoped, stage_group=None, stage=None, **{
        k: v for k, v in job_kw.items() if k not in ("stage_group", "stage")
    })
    placed_rows = placed_q.order_by(Submission.updated_at.desc()).limit(100).all()
    emp_ids = {r.employee_id for r in placed_rows}
    job_ids = {r.job_requirement_id for r in placed_rows}
    employees = {e.id: e for e in db.query(Employee).filter(Employee.id.in_(emp_ids)).all()} if emp_ids else {}
    jobs = {j.id: j for j in db.query(JobRequirement).filter(JobRequirement.id.in_(job_ids)).all()} if job_ids else {}
    client_ids = {j.client_id for j in jobs.values() if j.client_id}
    orgs = {
        o.id: o.organization_name
        for o in db.query(CRMOrganization).filter(CRMOrganization.id.in_(client_ids)).all()
    } if client_ids else {}

    placements_detail = []
    for row in placed_rows:
        job = jobs.get(row.job_requirement_id)
        emp = employees.get(row.employee_id)
        placements_detail.append({
            "submission_id": row.id,
            "candidate": _employee_name(emp),
            "employee_id": row.employee_id,
            "job_title": job.job_title if job else None,
            "job_requirement_id": row.job_requirement_id,
            "client": orgs.get(job.client_id) if job and job.client_id else (job.client if job else None),
            "submission_date": row.submission_date.isoformat() if row.submission_date else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            "status": row.status,
        })

    return _envelope(
        report_type="pipeline",
        scope="own" if scoped else "organization",
        date_from=df,
        date_to=dt,
        preset=resolved_preset,
        date_basis={
            "by_stage": "Current submission stage snapshot",
            "conversion": "Based on current pipeline stages",
            "placements_detail": "Current Placed-stage submissions (limit 100)",
        },
        filters_applied=filters,
        summary={
            "conversion_basis": "Based on current pipeline stages",
            "submitted": count_submitted(db, scoped),
            "interviews_scheduled": count_interviews_scheduled(db, scoped),
            "offers": count_offers(db, scoped),
            "placements": count_placements(db, scoped),
        },
        sections={
            "by_stage": [{"stage": s, "count": stage_counts[s]} for s in PIPELINE_STAGES],
            "conversion": conversion,
            "interview_status": interview_status,
            "offer_status": offer_status,
            "placements_detail": placements_detail,
        },
    )


@router.get("/contacts", response_model=ReportEnvelope)
async def reports_contacts(
    preset: str = Query("last_30_days"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    recruiter_contact_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    organization_id: Optional[int] = Query(None),
    job_id: Optional[int] = Query(None),
    job_source: Optional[str] = Query(None),
    job_status: Optional[str] = Query(None),
    candidate_source: Optional[str] = Query(None),
    stage_group: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    df, dt, resolved_preset = resolve_date_range(preset, date_from, date_to)
    scoped = _resolve_scope_owner(principal, owner)
    filters = _filters_dict(owner=owner, organization_id=organization_id, client_id=client_id)
    now = datetime.utcnow()

    act_q = (
        db.query(CRMActivity.activity_type, func.count(CRMActivity.id))
        .filter(
            CRMActivity.contact_id.isnot(None),
            _in_range(CRMActivity.activity_date, df, dt),
        )
        .group_by(CRMActivity.activity_type)
    )
    act_q = _apply_activity_filters(
        act_q,
        owner=scoped,
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
    )
    contact_activity = [{"activity_type": t or "Other", "count": c} for t, c in act_q.all()]

    contacts_q = db.query(CRMContact)
    if scoped:
        contacts_q = contacts_q.filter(CRMContact.created_by == scoped)
    org = client_id if client_id is not None else organization_id
    if org is not None:
        contacts_q = contacts_q.filter(CRMContact.organization_id == org)
    contacts = contacts_q.all()

    overdue_ids = {
        a.contact_id
        for a in follow_ups_due_query(db, scoped)
        .filter(CRMActivity.due_date < now, CRMActivity.contact_id.isnot(None))
        .all()
    }

    attention = []
    for c in contacts:
        reasons = []
        if c.id in overdue_ids:
            reasons.append("overdue_follow_up")
        if not c.organization_id:
            reasons.append("no_company")
        if not (c.email or "").strip():
            reasons.append("incomplete_email")
        if reasons:
            attention.append({
                "contact_id": c.id,
                "contact_name": _contact_name(c),
                "email": c.email,
                "organization_id": c.organization_id,
                "reasons": reasons,
            })
        if len(attention) >= 50:
            break

    # company performance: top orgs by jobs in period
    top_q = (
        db.query(JobRequirement.client_id, func.count(JobRequirement.id))
        .filter(JobRequirement.client_id.isnot(None), _in_range(JobRequirement.created_at, df, dt))
    )
    top_q = _apply_owner(top_q, JobRequirement, scoped)
    top_rows = (
        top_q.group_by(JobRequirement.client_id)
        .order_by(func.count(JobRequirement.id).desc())
        .limit(10)
        .all()
    )
    org_ids = [r[0] for r in top_rows]
    org_names = {
        o.id: o.organization_name
        for o in db.query(CRMOrganization).filter(CRMOrganization.id.in_(org_ids)).all()
    } if org_ids else {}
    company_performance = [
        {"organization_id": oid, "organization_name": org_names.get(oid), "job_count": cnt}
        for oid, cnt in top_rows
    ]

    return _envelope(
        report_type="contacts",
        scope="own" if scoped else "organization",
        date_from=df,
        date_to=dt,
        preset=resolved_preset,
        date_basis={
            "contact_activity": "CRMActivity.activity_date in range with contact_id",
            "attention": "Current contacts needing attention (limit 50)",
            "company_performance": "Jobs with client_id created in range",
        },
        filters_applied=filters,
        sections={
            "contact_activity": contact_activity,
            "attention": attention,
            "company_performance": company_performance,
        },
    )


@router.get("/activity", response_model=ReportEnvelope)
async def reports_activity(
    preset: str = Query("last_30_days"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    recruiter_contact_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    organization_id: Optional[int] = Query(None),
    job_id: Optional[int] = Query(None),
    job_source: Optional[str] = Query(None),
    job_status: Optional[str] = Query(None),
    candidate_source: Optional[str] = Query(None),
    stage_group: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    df, dt, resolved_preset = resolve_date_range(preset, date_from, date_to)
    scoped = _resolve_scope_owner(principal, owner)
    filters = _filters_dict(
        owner=owner,
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
    )

    base = db.query(CRMActivity).filter(_in_range(CRMActivity.activity_date, df, dt))
    base = _apply_activity_filters(
        base,
        owner=scoped,
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
    )

    by_type_q = (
        db.query(CRMActivity.activity_type, func.count(CRMActivity.id))
        .filter(_in_range(CRMActivity.activity_date, df, dt))
        .group_by(CRMActivity.activity_type)
    )
    by_type_q = _apply_activity_filters(
        by_type_q,
        owner=scoped,
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
    )
    by_type = [{"activity_type": t or "Other", "count": c} for t, c in by_type_q.all()]

    by_user_q = (
        db.query(CRMActivity.created_by, func.count(CRMActivity.id))
        .filter(_in_range(CRMActivity.activity_date, df, dt))
        .group_by(CRMActivity.created_by)
    )
    by_user_q = _apply_activity_filters(
        by_user_q,
        owner=scoped,
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
    )
    by_user = [{"user_id": u or "unknown", "count": c} for u, c in by_user_q.all()]

    # Subject/type only — never description bodies
    detail_rows = [
        {
            "id": a.id,
            "activity_type": a.activity_type,
            "subject": a.subject,
            "activity_date": a.activity_date.isoformat() if a.activity_date else None,
            "created_by": a.created_by,
            "contact_id": a.contact_id,
            "organization_id": a.organization_id,
            "job_requirement_id": a.job_requirement_id,
            "employee_id": a.employee_id,
            "submission_id": a.submission_id,
        }
        for a in base.order_by(CRMActivity.activity_date.desc()).limit(200).all()
    ]

    return _envelope(
        report_type="activity",
        scope="own" if scoped else "organization",
        date_from=df,
        date_to=dt,
        preset=resolved_preset,
        date_basis={"by_type": "CRMActivity.activity_date in range", "by_user": "created_by in range"},
        filters_applied=filters,
        sections={"by_type": by_type, "by_user": by_user},
        rows=detail_rows,
    )


@router.get("/follow-ups", response_model=ReportEnvelope)
async def reports_follow_ups(
    preset: str = Query("last_30_days"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    recruiter_contact_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    organization_id: Optional[int] = Query(None),
    job_id: Optional[int] = Query(None),
    job_source: Optional[str] = Query(None),
    job_status: Optional[str] = Query(None),
    candidate_source: Optional[str] = Query(None),
    stage_group: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    df, dt, resolved_preset = resolve_date_range(preset, date_from, date_to)
    scoped = _resolve_scope_owner(principal, owner)
    filters = _filters_dict(owner=owner, job_id=job_id, client_id=client_id)
    now = datetime.utcnow()
    today = now.date()
    week_end = _utc_day_end(today + timedelta(days=(6 - today.weekday())))

    q = db.query(CRMActivity).filter(CRMActivity.due_date.isnot(None))
    q = _apply_activity_filters(
        q,
        owner=scoped,
        recruiter_contact_id=recruiter_contact_id,
        client_id=client_id,
        organization_id=organization_id,
        job_id=job_id,
    )
    rows = q.order_by(CRMActivity.due_date.asc()).limit(500).all()

    buckets = {
        "overdue": 0,
        "due_today": 0,
        "due_this_week": 0,
        "upcoming": 0,
        "completed": 0,
        "cancelled": 0,
    }
    detail = []

    for a in rows:
        status_l = (a.status or "").strip().lower()
        if status_l in ("done", "completed"):
            bucket = "completed"
        elif status_l in ("cancelled", "canceled"):
            bucket = "cancelled"
        elif a.due_date < now and status_l == "open":
            bucket = "overdue"
        elif a.due_date.date() == today and status_l == "open":
            bucket = "due_today"
        elif a.due_date <= week_end and a.due_date > now and status_l == "open":
            bucket = "due_this_week"
        elif status_l == "open":
            bucket = "upcoming"
        else:
            continue
        buckets[bucket] += 1
        if len(detail) < 200:
            detail.append({
                "id": a.id,
                "bucket": bucket,
                "subject": a.subject or a.activity_type,
                "activity_type": a.activity_type,
                "status": a.status,
                "due_date": a.due_date.isoformat() if a.due_date else None,
                "contact_id": a.contact_id,
                "organization_id": a.organization_id,
                "employee_id": a.employee_id,
                "job_requirement_id": a.job_requirement_id,
                "submission_id": a.submission_id,
                "assigned_to": a.assigned_to,
                "created_by": a.created_by,
            })

    return _envelope(
        report_type="follow-ups",
        scope="own" if scoped else "organization",
        date_from=df,
        date_to=dt,
        preset=resolved_preset,
        date_basis={
            "buckets": "Current follow-ups by due_date vs now (not limited to report date range)",
            "follow_ups_due": "Same as dashboard Open + due_date not null",
        },
        filters_applied=filters,
        summary={
            **buckets,
            "follow_ups_due": count_follow_ups_due(db, scoped),
        },
        sections={"buckets": [{"bucket": k, "count": v} for k, v in buckets.items()]},
        rows=detail,
    )


# ---------------------------------------------------------------------------
# CSV export
# ---------------------------------------------------------------------------


def _csv_escape_row(values: list[Any]) -> list[str]:
    out = []
    for v in values:
        if v is None:
            out.append("")
        elif isinstance(v, datetime):
            out.append(v.isoformat())
        else:
            out.append(str(v))
    return out


def _streaming_csv(headers: list[str], rows: list[list[Any]], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf, quoting=csv.QUOTE_MINIMAL)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(_csv_escape_row(row))
    payload = buf.getvalue().encode("utf-8-sig")  # BOM for Excel

    # Ensure forbidden sensitive fields never appear in CSV content
    lowered = payload.lower()
    for forbidden in (b"resume_text", b"body_html", b"body_text", b"access_token", b"refresh_token"):
        if forbidden in lowered:
            # Strip accidental leakage — should not happen with curated columns
            payload = lowered.replace(forbidden, b"[redacted]")

    return StreamingResponse(
        io.BytesIO(payload),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}",
        },
    )


@router.get("/export")
async def reports_export(
    report_type: str = Query(..., description="overview|jobs|candidates|pipeline|contacts|activity|follow-ups"),
    format: str = Query("csv"),
    preset: str = Query("last_30_days"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    owner: Optional[str] = Query(None),
    recruiter_contact_id: Optional[int] = Query(None),
    client_id: Optional[int] = Query(None),
    organization_id: Optional[int] = Query(None),
    job_id: Optional[int] = Query(None),
    job_source: Optional[str] = Query(None),
    job_status: Optional[str] = Query(None),
    candidate_source: Optional[str] = Query(None),
    stage_group: Optional[str] = Query(None),
    stage: Optional[str] = Query(None),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    if format.lower() != "csv":
        raise HTTPException(status_code=422, detail="Only format=csv is supported")
    rt = report_type.strip().lower()
    if rt not in REPORT_TYPES:
        raise HTTPException(status_code=422, detail=f"Unknown report_type. Expected one of: {', '.join(REPORT_TYPES)}")

    df, dt, resolved_preset = resolve_date_range(preset, date_from, date_to)
    scoped = _resolve_scope_owner(principal, owner)
    stamp = datetime.utcnow().strftime("%Y%m%d")
    filename = f"joblens_{rt.replace('-', '_')}_{resolved_preset}_{stamp}.csv"

    if rt == "overview":
        env = await reports_overview(
            preset=preset, date_from=date_from, date_to=date_to, owner=owner,
            recruiter_contact_id=recruiter_contact_id, client_id=client_id,
            organization_id=organization_id, job_id=job_id, job_source=job_source,
            job_status=job_status, candidate_source=candidate_source,
            stage_group=stage_group, stage=stage, principal=principal, db=db,
        )
        headers = ["Metric", "Value"]
        rows = [[k, v] for k, v in env.summary.items()]
        return _streaming_csv(headers, rows, filename)

    if rt == "jobs":
        env = await reports_jobs(
            preset=preset, date_from=date_from, date_to=date_to, owner=owner,
            recruiter_contact_id=recruiter_contact_id, client_id=client_id,
            organization_id=organization_id, job_id=job_id, job_source=job_source,
            job_status=job_status, candidate_source=candidate_source,
            stage_group=stage_group, stage=stage, principal=principal, db=db,
        )
        headers = ["Section", "Label", "Count"]
        rows: list[list[Any]] = []
        for item in env.sections.get("by_status", []):
            rows.append(["by_status", item["status"], item["count"]])
        for item in env.sections.get("by_source", []):
            rows.append(["by_source", item["source"], item["count"]])
        for item in env.sections.get("aging_open", []):
            rows.append(["aging_open", item["bucket"], item["count"]])
        return _streaming_csv(headers, rows, filename)

    if rt == "candidates":
        env = await reports_candidates(
            preset=preset, date_from=date_from, date_to=date_to, owner=owner,
            candidate_source=candidate_source, recruiter_contact_id=recruiter_contact_id,
            client_id=client_id, organization_id=organization_id, job_id=job_id,
            job_source=job_source, job_status=job_status, stage_group=stage_group,
            stage=stage, principal=principal, db=db,
        )
        headers = ["Section", "Label", "Count"]
        rows = []
        for item in env.sections.get("by_status", []):
            rows.append(["by_status", item["status"], item["count"]])
        for item in env.sections.get("by_source", []):
            rows.append(["by_source", item["source"], item["count"]])
        return _streaming_csv(headers, rows, filename)

    if rt == "pipeline":
        env = await reports_pipeline(
            preset=preset, date_from=date_from, date_to=date_to, owner=owner,
            recruiter_contact_id=recruiter_contact_id, client_id=client_id,
            organization_id=organization_id, job_id=job_id, job_source=job_source,
            job_status=job_status, candidate_source=candidate_source,
            stage_group=stage_group, stage=stage, principal=principal, db=db,
        )
        return _streaming_csv(["Col1", "Col2", "Col3"], [
            ["Stage", "Count", ""],
            *[[item["stage"], item["count"], ""] for item in env.sections.get("by_stage", [])],
            ["From", "To", "Rate %"],
            *[[c["from_stage"], c["to_stage"], c["rate_pct"]] for c in env.sections.get("conversion", [])],
        ], filename)

    if rt == "contacts":
        env = await reports_contacts(
            preset=preset, date_from=date_from, date_to=date_to, owner=owner,
            recruiter_contact_id=recruiter_contact_id, client_id=client_id,
            organization_id=organization_id, job_id=job_id, job_source=job_source,
            job_status=job_status, candidate_source=candidate_source,
            stage_group=stage_group, stage=stage, principal=principal, db=db,
        )
        headers = ["Contact ID", "Name", "Email", "Reasons"]
        rows = [
            [a.get("contact_id"), a.get("contact_name"), a.get("email"), ";".join(a.get("reasons") or [])]
            for a in env.sections.get("attention", [])
        ]
        return _streaming_csv(headers, rows, filename)

    if rt == "activity":
        env = await reports_activity(
            preset=preset, date_from=date_from, date_to=date_to, owner=owner,
            recruiter_contact_id=recruiter_contact_id, client_id=client_id,
            organization_id=organization_id, job_id=job_id, job_source=job_source,
            job_status=job_status, candidate_source=candidate_source,
            stage_group=stage_group, stage=stage, principal=principal, db=db,
        )
        headers = ["ID", "Type", "Subject", "Activity Date", "Created By"]
        rows = [
            [r.get("id"), r.get("activity_type"), r.get("subject"), r.get("activity_date"), r.get("created_by")]
            for r in env.rows
        ]
        return _streaming_csv(headers, rows, filename)

    # follow-ups
    env = await reports_follow_ups(
        preset=preset, date_from=date_from, date_to=date_to, owner=owner,
        recruiter_contact_id=recruiter_contact_id, client_id=client_id,
        organization_id=organization_id, job_id=job_id, job_source=job_source,
        job_status=job_status, candidate_source=candidate_source,
        stage_group=stage_group, stage=stage, principal=principal, db=db,
    )
    headers = ["ID", "Bucket", "Subject", "Status", "Due Date", "Contact ID", "Job ID", "Employee ID"]
    rows = [
        [
            r.get("id"), r.get("bucket"), r.get("subject"), r.get("status"),
            r.get("due_date"), r.get("contact_id"), r.get("job_requirement_id"), r.get("employee_id"),
        ]
        for r in env.rows
    ]
    return _streaming_csv(headers, rows, filename)
