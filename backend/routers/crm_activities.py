from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CRMActivity,
    CRMActivityCreate,
    CRMActivityUpdate,
    CRMActivityResponse,
)
from ats_auth import get_current_ats_user
from services.audit import log_audit

router = APIRouter()


def _get_or_404(db: Session, activity_id: int) -> CRMActivity:
    activity = db.query(CRMActivity).filter(CRMActivity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found.")
    return activity


@router.post("/", response_model=CRMActivityResponse, status_code=201)
async def create_activity(
    body: CRMActivityCreate,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    activity = CRMActivity(**body.model_dump())
    db.add(activity)
    db.commit()
    db.refresh(activity)
    return activity


@router.get("/", response_model=list[CRMActivityResponse])
async def list_activities(
    organization_id: Optional[int] = Query(None),
    contact_id: Optional[int] = Query(None),
    employee_id: Optional[int] = Query(None),
    job_requirement_id: Optional[int] = Query(None),
    activity_type: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    query = db.query(CRMActivity)
    if organization_id is not None:
        query = query.filter(CRMActivity.organization_id == organization_id)
    if contact_id is not None:
        query = query.filter(CRMActivity.contact_id == contact_id)
    if employee_id is not None:
        query = query.filter(CRMActivity.employee_id == employee_id)
    if job_requirement_id is not None:
        query = query.filter(CRMActivity.job_requirement_id == job_requirement_id)
    if activity_type:
        query = query.filter(CRMActivity.activity_type == activity_type)
    return query.order_by(CRMActivity.activity_date.desc()).limit(limit).all()


@router.get("/{activity_id}", response_model=CRMActivityResponse)
async def get_activity(
    activity_id: int,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    return _get_or_404(db, activity_id)


@router.put("/{activity_id}", response_model=CRMActivityResponse)
async def update_activity(
    activity_id: int,
    body: CRMActivityUpdate,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    activity = _get_or_404(db, activity_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(activity, key, value)
    db.commit()
    db.refresh(activity)
    return activity


@router.delete("/{activity_id}")
async def delete_activity(
    activity_id: int,
    _: None = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    activity = _get_or_404(db, activity_id)
    db.delete(activity)
    db.commit()
    log_audit(db, "activity.deleted", "activity", activity_id, "Deleted activity")
    return {"message": "Activity deleted."}
