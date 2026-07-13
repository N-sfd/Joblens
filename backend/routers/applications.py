"""Application Status API — detailed history view over JobApplication records.

Mounted at /api/applications. Ownership via get_owner (user or guest).
Does not invent timeline events that contradict AiActivity records.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, func as sa_func
from sqlalchemy.orm import Session

from database import get_db
from models import (
    JobApplication,
    JobMatch,
    AiActivity,
    ApplicationNote,
    ApplicationNoteCreate,
    ApplicationNoteUpdate,
    ApplicationNoteResponse,
    ApplicationStatusChangeRequest,
    ApplicationReminderUpdate,
    ApplicationStatusSummary,
    ApplicationStatusListItem,
    ApplicationStatusListResponse,
    ApplicationStatusDetailResponse,
    ApplicationTimelineEvent,
    JobApplicationResponse,
)
from auth import Owner, get_owner, owned, log_activity
from services.application_status import (
    method_label,
    validate_transition,
    reminder_status,
    parse_snapshot,
    source_job_flags,
    compute_action_needed,
    ALLOWED_TRANSITIONS,
)

router = APIRouter()
logger = logging.getLogger(__name__)

SORT_FIELDS = {
    "last_activity": JobApplication.last_activity_at,
    "newest": JobApplication.created_at,
    "oldest": JobApplication.created_at,
    "follow_up": JobApplication.follow_up_date,
    "company": JobApplication.company,
    "role": JobApplication.role,
    "status": JobApplication.status,
}


def apps_for_owner(db: Session, owner: Owner):
    return owned(db.query(JobApplication), JobApplication, owner)


def get_owned_app(db: Session, owner: Owner, application_id: int) -> JobApplication:
    app = apps_for_owner(db, owner).filter(JobApplication.id == application_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found.")
    return app


def _activity_query(db: Session, owner: Owner):
    return owned(db.query(AiActivity), AiActivity, owner)


def _build_summary(db: Session, owner: Owner, base_q=None) -> ApplicationStatusSummary:
    q = base_q if base_q is not None else apps_for_owner(db, owner).filter(JobApplication.archived_at.is_(None))
    rows = q.all()
    total = len(rows)
    by_status: dict[str, int] = {}
    follow_ups_due = 0
    action_needed = 0
    opened_this_week = 0
    applied_this_week = 0
    week_ago = datetime.utcnow() - timedelta(days=7)
    now = datetime.utcnow()

    for job in rows:
        by_status[job.status] = by_status.get(job.status, 0) + 1
        _, closed = source_job_flags(db, job)
        needed, _ = compute_action_needed(job, source_closed=closed, now=now)
        if needed:
            action_needed += 1
        rs = reminder_status(job, now=now)
        if rs in {"due_today", "missed"}:
            follow_ups_due += 1
        if job.application_opened_at and job.application_opened_at >= week_ago:
            opened_this_week += 1
        if job.applied_at and job.applied_at >= week_ago:
            applied_this_week += 1

    percentages = {
        k: round((v / total) * 100, 1) if total else 0.0 for k, v in by_status.items()
    }
    return ApplicationStatusSummary(
        total=total,
        by_status=by_status,
        applications_opened=by_status.get("Application Opened", 0),
        applications_in_progress=by_status.get("Application In Progress", 0),
        applied=by_status.get("Applied", 0),
        recruiter_contacts=by_status.get("Recruiter Contacted", 0),
        interviews=by_status.get("Interviewing", 0),
        offers=by_status.get("Offer", 0),
        follow_ups_due=follow_ups_due,
        action_needed=action_needed,
        opened_this_week=opened_this_week,
        applied_this_week=applied_this_week,
        percentages=percentages,
    )


def _match_score(db: Session, owner: Owner, job: JobApplication) -> Optional[float]:
    if not job.source_job_requirement_id:
        return None
    q = owned(db.query(JobMatch), JobMatch, owner).filter(
        JobMatch.job_requirement_id == job.source_job_requirement_id
    ).order_by(JobMatch.created_at.desc())
    match = q.first()
    if not match or not match.match_json:
        return None
    try:
        data = json.loads(match.match_json)
        score = data.get("overall_score") or data.get("match_score") or data.get("score")
        return float(score) if score is not None else None
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


def _to_list_item(db: Session, owner: Owner, job: JobApplication) -> ApplicationStatusListItem:
    snap = parse_snapshot(job)
    available, closed = source_job_flags(db, job)
    needed, reason = compute_action_needed(job, source_closed=closed)
    # Persist computed flags lightly (best-effort, no extra commit storm on list)
    job.action_required = needed
    job.action_required_reason = reason

    return ApplicationStatusListItem(
        id=job.id,
        company=job.company,
        role=job.role,
        status=job.status,
        location=job.location,
        work_type=job.work_type,
        application_method=job.application_method,
        application_method_label=method_label(job.application_method),
        application_source=job.application_source,
        job_url=job.job_url,
        has_application_url=bool(job.job_url),
        source_job_requirement_id=job.source_job_requirement_id,
        source_job_available=available,
        source_job_closed=closed or (bool(snap) and not available and bool(job.source_job_requirement_id)),
        job_reference_number=(snap or {}).get("job_reference_number"),
        client=(snap or {}).get("client"),
        end_client=(snap or {}).get("end_client"),
        recruiter_name=job.recruiter_name or (snap or {}).get("recruiter_name"),
        recruiter_email=job.recruiter_email or (snap or {}).get("recruiter_email"),
        application_opened_at=job.application_opened_at,
        recruiter_contacted_at=job.recruiter_contacted_at,
        applied_at=job.applied_at,
        last_activity_at=job.last_activity_at or job.updated_at or job.created_at,
        follow_up_date=job.follow_up_date,
        reminder_type=job.reminder_type,
        reminder_completed_at=job.reminder_completed_at,
        reminder_status=reminder_status(job),
        action_required=needed,
        action_required_reason=reason,
        archived_at=job.archived_at,
        match_score=_match_score(db, owner, job),
        created_at=job.created_at,
    )


def _build_timeline(db: Session, owner: Owner, job: JobApplication) -> list[ApplicationTimelineEvent]:
    events: list[ApplicationTimelineEvent] = []
    activities = (
        _activity_query(db, owner)
        .filter(
            or_(
                AiActivity.summary.contains(job.company),
                AiActivity.summary.contains(job.role),
            )
        )
        .order_by(AiActivity.created_at.asc())
        .limit(100)
        .all()
    )
    activity_types = set()
    for a in activities:
        # Prefer real activity records; skip loose matches that don't mention this role/company pair well
        summary = a.summary or ""
        if job.company not in summary and job.role not in summary:
            continue
        events.append(ApplicationTimelineEvent(
            id=a.id,
            event_type=a.activity_type,
            summary=a.summary,
            detail=a.detail,
            occurred_at=a.created_at,
            source="activity",
        ))
        activity_types.add(a.activity_type)

    # Derive timestamp milestones only when no contradicting activity type already covers them
    def add_derived(event_type: str, when, summary: str):
        if not when:
            return
        if event_type in activity_types or any(
            e.event_type == event_type for e in events
        ):
            return
        events.append(ApplicationTimelineEvent(
            event_type=event_type,
            summary=summary,
            occurred_at=when,
            source="derived",
        ))

    add_derived("job_saved", job.created_at, f"Job saved — {job.company} — {job.role}")
    add_derived("application_opened", job.application_opened_at, "Application URL opened")
    add_derived("recruiter_contacted", job.recruiter_contacted_at, "Recruiter contacted")
    add_derived("applied", job.applied_at, "Marked as Applied")
    if job.follow_up_date and not any(e.event_type == "reminder_created" for e in events):
        when = job.status_changed_at or job.last_activity_at or job.created_at
        if when:
            events.append(ApplicationTimelineEvent(
                event_type="reminder_created",
                summary="Follow-up reminder scheduled",
                occurred_at=when,
                source="derived",
            ))

    events.sort(key=lambda e: e.occurred_at or datetime.min)
    return events


@router.get("/meta/transitions")
async def list_transitions():
    return {k: sorted(v) for k, v in ALLOWED_TRANSITIONS.items()}


@router.get("/status", response_model=ApplicationStatusListResponse)
async def list_application_status(
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None, description="Search role / company / recruiter"),
    status: Optional[str] = None,
    application_method: Optional[str] = None,
    application_source: Optional[str] = None,
    location: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    follow_up_status: Optional[str] = None,  # upcoming|due_today|missed|completed|none
    has_reminder: Optional[bool] = None,
    action_needed: Optional[bool] = None,
    include_archived: bool = False,
    sort: str = Query("last_activity"),
    order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = apps_for_owner(db, owner)
    if not include_archived:
        query = query.filter(JobApplication.archived_at.is_(None))

    if status:
        query = query.filter(JobApplication.status == status)
    if application_method:
        query = query.filter(JobApplication.application_method == application_method)
    if application_source:
        query = query.filter(JobApplication.application_source == application_source)
    if location:
        query = query.filter(JobApplication.location.ilike(f"%{location.strip()}%"))
    if date_from:
        query = query.filter(
            sa_func.coalesce(JobApplication.last_activity_at, JobApplication.created_at) >= date_from
        )
    if date_to:
        query = query.filter(
            sa_func.coalesce(JobApplication.last_activity_at, JobApplication.created_at) <= date_to
        )
    if has_reminder is True:
        query = query.filter(JobApplication.follow_up_date.isnot(None))
    elif has_reminder is False:
        query = query.filter(JobApplication.follow_up_date.is_(None))

    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(
            JobApplication.role.ilike(term),
            JobApplication.company.ilike(term),
            JobApplication.recruiter_name.ilike(term),
            JobApplication.recruiter_email.ilike(term),
            JobApplication.job_snapshot_json.ilike(term),
        ))

    # Summary over filtered set (before pagination) — compute after fetching for action/reminder filters
    all_rows = query.all()

    if follow_up_status:
        all_rows = [r for r in all_rows if reminder_status(r) == follow_up_status]
    if action_needed is not None:
        filtered = []
        for r in all_rows:
            _, closed = source_job_flags(db, r)
            needed, _ = compute_action_needed(r, source_closed=closed)
            if needed == action_needed:
                filtered.append(r)
        all_rows = filtered

    # Sort
    reverse = order.lower() != "asc"
    if sort == "oldest":
        reverse = False
        key_fn = lambda r: r.created_at or datetime.min
    elif sort == "newest":
        reverse = True
        key_fn = lambda r: r.created_at or datetime.min
    elif sort == "follow_up":
        key_fn = lambda r: r.follow_up_date or datetime.max
        reverse = order.lower() != "asc"
    elif sort == "company":
        key_fn = lambda r: (r.company or "").lower()
    elif sort == "role":
        key_fn = lambda r: (r.role or "").lower()
    elif sort == "status":
        key_fn = lambda r: r.status or ""
    else:  # last_activity default
        key_fn = lambda r: r.last_activity_at or r.updated_at or r.created_at or datetime.min

    all_rows.sort(key=key_fn, reverse=reverse)

    total = len(all_rows)
    total_pages = max(1, ceil(total / page_size)) if total else 1
    start = (page - 1) * page_size
    page_rows = all_rows[start:start + page_size]

    # Full unfiltered summary for header cards
    summary = _build_summary(db, owner)

    items = [_to_list_item(db, owner, r) for r in page_rows]
    try:
        db.commit()  # persist action_required flags touched in _to_list_item
    except Exception:
        db.rollback()

    return ApplicationStatusListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        summary=summary,
    )


@router.get("/{application_id}", response_model=ApplicationStatusDetailResponse)
async def get_application_detail(
    application_id: int,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    job = get_owned_app(db, owner, application_id)
    available, closed = source_job_flags(db, job)
    needed, reason = compute_action_needed(job, source_closed=closed)
    job.action_required = needed
    job.action_required_reason = reason
    db.commit()
    db.refresh(job)

    notes = (
        owned(db.query(ApplicationNote), ApplicationNote, owner)
        .filter(ApplicationNote.job_application_id == job.id)
        .order_by(ApplicationNote.created_at.desc())
        .all()
    )

    match_score = _match_score(db, owner, job)
    match_summary = None
    if job.source_job_requirement_id:
        m = (
            owned(db.query(JobMatch), JobMatch, owner)
            .filter(JobMatch.job_requirement_id == job.source_job_requirement_id)
            .order_by(JobMatch.created_at.desc())
            .first()
        )
        if m and m.match_json:
            try:
                data = json.loads(m.match_json)
                match_summary = data.get("recommendation") or data.get("summary")
            except (json.JSONDecodeError, TypeError):
                pass

    return ApplicationStatusDetailResponse(
        application=JobApplicationResponse.model_validate(job),
        job_snapshot=parse_snapshot(job),
        source_job_available=available,
        source_job_closed=closed or (bool(job.job_snapshot_json) and not available and bool(job.source_job_requirement_id)),
        application_method_label=method_label(job.application_method),
        match_score=match_score,
        match_summary=match_summary,
        timeline=_build_timeline(db, owner, job),
        notes=[ApplicationNoteResponse.model_validate(n) for n in notes],
        reminder_status=reminder_status(job),
        action_required=needed,
        action_required_reason=reason,
    )


@router.patch("/{application_id}/status", response_model=ApplicationStatusDetailResponse)
async def change_application_status(
    application_id: int,
    body: ApplicationStatusChangeRequest,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    job = get_owned_app(db, owner, application_id)
    new_status = body.status
    try:
        validate_transition(job.status, new_status, confirmed=body.confirmed)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))

    now = body.effective_date or datetime.utcnow()
    old = job.status
    if old != new_status:
        job.status = new_status
        job.status_changed_at = now
        job.status_changed_by = "user"
        job.last_activity_at = now
        job.last_user_activity_at = now
        job.updated_at = now
        if new_status == "Applied" and not job.applied_at:
            job.applied_at = now
        if new_status == "Application Opened" and not job.application_opened_at:
            job.application_opened_at = now
        if new_status == "Recruiter Contacted" and not job.recruiter_contacted_at:
            job.recruiter_contacted_at = now
        if new_status == "Withdrawn" and body.confirmed:
            pass
        if body.note:
            note = ApplicationNote(
                job_application_id=job.id,
                content=body.note.strip(),
                user_id=owner.user_id,
                guest_id=owner.guest_id,
            )
            db.add(note)
        db.commit()
        log_activity(db, owner, "status_changed", f"{job.company} — {job.role} → {new_status}")
        db.refresh(job)

    return await get_application_detail(application_id, owner, db)


@router.post("/{application_id}/archive")
async def archive_application(
    application_id: int,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    job = get_owned_app(db, owner, application_id)
    job.archived_at = datetime.utcnow()
    job.last_user_activity_at = datetime.utcnow()
    db.commit()
    return {"message": "Archived.", "id": job.id}


@router.post("/{application_id}/notes", response_model=ApplicationNoteResponse, status_code=201)
async def create_note(
    application_id: int,
    body: ApplicationNoteCreate,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    job = get_owned_app(db, owner, application_id)
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="Note content is required.")
    note = ApplicationNote(
        job_application_id=job.id,
        content=content,
        user_id=owner.user_id,
        guest_id=owner.guest_id,
    )
    db.add(note)
    job.last_user_activity_at = datetime.utcnow()
    job.last_activity_at = datetime.utcnow()
    db.commit()
    db.refresh(note)
    return ApplicationNoteResponse.model_validate(note)


@router.put("/{application_id}/notes/{note_id}", response_model=ApplicationNoteResponse)
async def update_note(
    application_id: int,
    note_id: int,
    body: ApplicationNoteUpdate,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    get_owned_app(db, owner, application_id)
    note = (
        owned(db.query(ApplicationNote), ApplicationNote, owner)
        .filter(
            ApplicationNote.id == note_id,
            ApplicationNote.job_application_id == application_id,
        )
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=422, detail="Note content is required.")
    note.content = content
    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)
    return ApplicationNoteResponse.model_validate(note)


@router.delete("/{application_id}/notes/{note_id}")
async def delete_note(
    application_id: int,
    note_id: int,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    get_owned_app(db, owner, application_id)
    note = (
        owned(db.query(ApplicationNote), ApplicationNote, owner)
        .filter(
            ApplicationNote.id == note_id,
            ApplicationNote.job_application_id == application_id,
        )
        .first()
    )
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")
    db.delete(note)
    db.commit()
    return {"message": "Deleted."}


@router.patch("/{application_id}/reminder", response_model=JobApplicationResponse)
async def update_reminder(
    application_id: int,
    body: ApplicationReminderUpdate,
    owner: Owner = Depends(get_owner),
    db: Session = Depends(get_db),
):
    job = get_owned_app(db, owner, application_id)
    now = datetime.utcnow()
    try:
        if body.completed:
            job.reminder_completed_at = now
        if body.snooze_days is not None:
            base = job.follow_up_date or now
            job.follow_up_date = base + timedelta(days=max(1, body.snooze_days))
            job.reminder_completed_at = None
        if body.follow_up_date is not None:
            job.follow_up_date = body.follow_up_date
            job.reminder_completed_at = None
        if body.reminder_type is not None:
            job.reminder_type = body.reminder_type
        job.last_user_activity_at = now
        job.last_activity_at = now
        db.commit()
        db.refresh(job)
    except Exception:
        logger.exception("Reminder update failed for application_id=%s", application_id)
        db.rollback()
        raise HTTPException(status_code=500, detail="Reminder update failed.")
    return JobApplicationResponse.model_validate(job)
