from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CRMOrganization,
    CRMOrganizationCreate,
    CRMOrganizationUpdate,
    CRMOrganizationResponse,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from services.audit import log_audit

router = APIRouter()


def _domain_from_website(website: Optional[str]) -> Optional[str]:
    if not website:
        return None
    w = website.strip().lower()
    for prefix in ("https://", "http://", "www."):
        if w.startswith(prefix):
            w = w[len(prefix):]
    w = w.split("/")[0].strip()
    return w or None


def _get_or_404(db: Session, org_id: int) -> CRMOrganization:
    org = db.query(CRMOrganization).filter(CRMOrganization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    return org


@router.post("/", response_model=CRMOrganizationResponse, status_code=201)
async def create_organization(
    body: CRMOrganizationCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    data = body.model_dump()
    if not data.get("email_domain"):
        data["email_domain"] = _domain_from_website(data.get("website"))
    org = CRMOrganization(**data)
    db.add(org)
    db.commit()
    db.refresh(org)
    log_audit(db, "organization.created", "organization", org.id, f"Created organization {org.organization_name}", principal.user_id)
    return org


@router.get("/", response_model=list[CRMOrganizationResponse])
async def list_organizations(
    type: Optional[str] = Query(None, description="Filter by organization_type"),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None, description="Search organization name"),
    needs_review: Optional[bool] = Query(None),
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    query = db.query(CRMOrganization)
    if type:
        query = query.filter(CRMOrganization.organization_type == type)
    if status:
        query = query.filter(CRMOrganization.status == status)
    if needs_review is not None:
        query = query.filter(CRMOrganization.needs_review == needs_review)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(CRMOrganization.organization_name.ilike(like))
    return query.order_by(CRMOrganization.organization_name.asc()).all()


@router.get("/{org_id}", response_model=CRMOrganizationResponse)
async def get_organization(
    org_id: int,
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    return _get_or_404(db, org_id)


@router.put("/{org_id}", response_model=CRMOrganizationResponse)
async def update_organization(
    org_id: int,
    body: CRMOrganizationUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    org = _get_or_404(db, org_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(org, key, value)
    db.commit()
    db.refresh(org)
    log_audit(db, "organization.updated", "organization", org.id, f"Updated organization {org.organization_name}", principal.user_id)
    return org


@router.delete("/{org_id}")
async def delete_organization(
    org_id: int,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    org = _get_or_404(db, org_id)
    name = org.organization_name
    db.delete(org)
    db.commit()
    log_audit(db, "organization.deleted", "organization", org_id, f"Deleted organization {name}", principal.user_id)
    return {"message": "Organization deleted."}
