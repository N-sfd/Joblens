"""Phase 8: Offer tracking for submissions."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import (
    OFFER_STATUSES,
    ONBOARDING_STATUSES,
    Employee,
    Offer,
    OfferCreate,
    OfferResponse,
    OfferUpdate,
    Submission,
    JobRequirement,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_writer
from services.audit import log_audit

router = APIRouter()


def _employee_name(emp: Employee | None) -> str | None:
    if not emp:
        return None
    return " ".join(p for p in [emp.first_name, emp.last_name] if p).strip() or emp.name


def _to_response(row: Offer, db: Session) -> OfferResponse:
    sub = db.query(Submission).filter(Submission.id == row.submission_id).first()
    job = db.query(JobRequirement).filter(JobRequirement.id == sub.job_requirement_id).first() if sub else None
    emp = db.query(Employee).filter(Employee.id == sub.employee_id).first() if sub else None
    return OfferResponse(
        id=row.id,
        submission_id=row.submission_id,
        offered_rate=row.offered_rate,
        rate_type=row.rate_type,
        start_date=row.start_date,
        offer_date=row.offer_date,
        expiry_date=row.expiry_date,
        status=row.status,
        onboarding_status=row.onboarding_status,
        notes=row.notes,
        job_title=job.job_title if job else None,
        employee_name=_employee_name(emp),
        submission_status=sub.status if sub else None,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _get_or_404(db: Session, offer_id: int) -> Offer:
    row = db.query(Offer).filter(Offer.id == offer_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Offer not found.")
    return row


@router.get("/", response_model=list[OfferResponse])
async def list_offers(
    submission_id: int | None = Query(None),
    job_requirement_id: int | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=200),
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    q = db.query(Offer)
    if submission_id is not None:
        q = q.filter(Offer.submission_id == submission_id)
    if job_requirement_id is not None:
        q = q.join(Submission, Submission.id == Offer.submission_id).filter(
            Submission.job_requirement_id == job_requirement_id
        )
    if status:
        q = q.filter(Offer.status == status)
    rows = q.order_by(Offer.offer_date.desc(), Offer.created_at.desc()).limit(limit).all()
    return [_to_response(r, db) for r in rows]


@router.post("/", response_model=OfferResponse, status_code=201)
async def create_offer(
    body: OfferCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    if body.status not in OFFER_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Use: {', '.join(OFFER_STATUSES)}")
    if body.onboarding_status not in ONBOARDING_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid onboarding status. Use: {', '.join(ONBOARDING_STATUSES)}")
    sub = db.query(Submission).filter(Submission.id == body.submission_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found.")

    data = body.model_dump()
    if not data.get("offer_date"):
        data["offer_date"] = datetime.utcnow()
    if not data.get("offered_rate"):
        data["offered_rate"] = sub.submitted_rate
    data["created_by"] = principal.user_id
    row = Offer(**data)
    db.add(row)
    sub.status = "Offer"
    job = db.query(JobRequirement).filter(JobRequirement.id == sub.job_requirement_id).first()
    if job:
        job.status = "Offer"
    db.commit()
    db.refresh(row)
    log_audit(db, "offer.created", "offer", row.id, "offer.created", principal.user_id)
    return _to_response(row, db)


@router.patch("/{offer_id}", response_model=OfferResponse)
async def update_offer(
    offer_id: int,
    body: OfferUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    row = _get_or_404(db, offer_id)
    data = body.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in OFFER_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Use: {', '.join(OFFER_STATUSES)}")
    if "onboarding_status" in data and data["onboarding_status"] not in ONBOARDING_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid onboarding status. Use: {', '.join(ONBOARDING_STATUSES)}")
    for key, value in data.items():
        setattr(row, key, value)
    if data.get("status") == "Accepted":
        sub = db.query(Submission).filter(Submission.id == row.submission_id).first()
        if sub:
            sub.status = "Selected"
            job = db.query(JobRequirement).filter(JobRequirement.id == sub.job_requirement_id).first()
            if job:
                job.status = "Selected"
    db.commit()
    db.refresh(row)
    log_audit(db, "offer.updated", "offer", row.id, "offer.updated", principal.user_id)
    return _to_response(row, db)
