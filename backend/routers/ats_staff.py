"""ATS staff profile + admin role management."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ats_auth import (
    AtsPrincipal,
    WRITE_ROLES,
    get_current_ats_user,
    invalidate_role_cache,
    require_admin,
    normalize_ats_role,
)
from database import get_db
from models import AtsStaffUser
from services.audit import log_audit

router = APIRouter()


class AtsMeResponse(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str
    role_source: str
    organization_name: Optional[str] = None
    can_write: bool
    is_admin: bool
    has_ats_access: bool


class AtsStaffUserOut(BaseModel):
    id: int
    clerk_user_id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str
    organization_name: Optional[str] = None
    role_updated_at: Optional[datetime] = None
    role_updated_by: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AtsStaffRoleUpdate(BaseModel):
    role: Literal["admin", "recruiter", "viewer"]
    organization_name: Optional[str] = Field(default=None, max_length=255)
    display_name: Optional[str] = Field(default=None, max_length=255)
    email: Optional[str] = Field(default=None, max_length=255)


class AtsStaffCreate(BaseModel):
    clerk_user_id: str = Field(min_length=3, max_length=128)
    role: Literal["admin", "recruiter", "viewer"] = "viewer"
    email: Optional[str] = None
    display_name: Optional[str] = None
    organization_name: Optional[str] = None


@router.get("/me", response_model=AtsMeResponse)
def ats_me(principal: AtsPrincipal = Depends(get_current_ats_user)):
    role = principal.role
    return AtsMeResponse(
        user_id=principal.user_id,
        email=principal.email,
        display_name=principal.display_name,
        role=role,
        role_source=principal.role_source,
        organization_name=principal.organization_name,
        can_write=role in WRITE_ROLES,
        is_admin=role == "admin",
        has_ats_access=role in WRITE_ROLES,
    )


@router.get("/users", response_model=list[AtsStaffUserOut])
def list_ats_users(
    _: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    rows = db.query(AtsStaffUser).order_by(AtsStaffUser.created_at.desc()).limit(200).all()
    return rows


@router.post("/users", response_model=AtsStaffUserOut, status_code=201)
def create_ats_user(
    body: AtsStaffCreate,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(AtsStaffUser).filter(AtsStaffUser.clerk_user_id == body.clerk_user_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Staff user already exists.")
    now = datetime.utcnow()
    row = AtsStaffUser(
        clerk_user_id=body.clerk_user_id.strip(),
        email=(body.email or "").strip().lower() or None,
        display_name=(body.display_name or "").strip() or None,
        organization_name=(body.organization_name or "").strip() or None,
        role=normalize_ats_role(body.role),
        role_updated_at=now,
        role_updated_by=principal.user_id,
        last_seen_at=None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    invalidate_role_cache(row.clerk_user_id)
    log_audit(
        db,
        action="ats_role_created",
        entity_type="ats_staff_user",
        entity_id=row.clerk_user_id,
        summary=f"role={row.role}; by={principal.user_id}",
        user_id=principal.user_id,
    )
    return row


@router.patch("/users/{clerk_user_id}", response_model=AtsStaffUserOut)
def update_ats_user_role(
    clerk_user_id: str,
    body: AtsStaffRoleUpdate,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.query(AtsStaffUser).filter(AtsStaffUser.clerk_user_id == clerk_user_id).first()
    if not row:
        row = AtsStaffUser(clerk_user_id=clerk_user_id)
        db.add(row)
    previous = row.role
    new_role = normalize_ats_role(body.role)
    row.role = new_role
    if body.email is not None:
        row.email = body.email.strip().lower() or None
    if body.display_name is not None:
        row.display_name = body.display_name.strip() or None
    if body.organization_name is not None:
        row.organization_name = body.organization_name.strip() or None
    row.role_updated_at = datetime.utcnow()
    row.role_updated_by = principal.user_id
    db.commit()
    db.refresh(row)
    invalidate_role_cache(clerk_user_id)
    log_audit(
        db,
        action="ats_role_changed",
        entity_type="ats_staff_user",
        entity_id=clerk_user_id,
        summary=f"previous={previous}; new={new_role}; by={principal.user_id}",
        user_id=principal.user_id,
    )
    return row
