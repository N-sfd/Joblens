from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CRMContact,
    CRMOrganization,
    CRMContactCreate,
    CRMContactUpdate,
    CRMContactResponse,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from services.audit import log_audit

router = APIRouter()


def normalize_email(email: Optional[str]) -> Optional[str]:
    if not email:
        return None
    return email.strip().lower() or None


def _to_response(db: Session, contact: CRMContact) -> CRMContactResponse:
    resp = CRMContactResponse.model_validate(contact)
    if contact.organization_id:
        org = db.query(CRMOrganization).filter(CRMOrganization.id == contact.organization_id).first()
        resp.organization_name = org.organization_name if org else None
    return resp


def _get_or_404(db: Session, contact_id: int) -> CRMContact:
    contact = db.query(CRMContact).filter(CRMContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")
    return contact


@router.post("/", response_model=CRMContactResponse, status_code=201)
async def create_contact(
    body: CRMContactCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    data = body.model_dump()
    normalized = normalize_email(data.get("email"))
    if normalized:
        existing = db.query(CRMContact).filter(CRMContact.normalized_email == normalized).first()
        if existing:
            raise HTTPException(status_code=409, detail="A contact with this email already exists.")
    contact = CRMContact(**data, normalized_email=normalized)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    log_audit(
        db, "contact.created", "contact", contact.id,
        f"Created contact {contact.first_name or ''} {contact.last_name or ''}".strip(),
        principal.user_id,
    )
    return _to_response(db, contact)


@router.get("/", response_model=list[CRMContactResponse])
async def list_contacts(
    organization_id: Optional[int] = Query(None),
    contact_type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    needs_review: Optional[bool] = Query(None),
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    query = db.query(CRMContact)
    if organization_id is not None:
        query = query.filter(CRMContact.organization_id == organization_id)
    if contact_type:
        query = query.filter(CRMContact.contact_type == contact_type)
    if status:
        query = query.filter(CRMContact.status == status)
    if needs_review is not None:
        query = query.filter(CRMContact.needs_review == needs_review)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (CRMContact.first_name.ilike(like))
            | (CRMContact.last_name.ilike(like))
            | (CRMContact.email.ilike(like))
        )
    contacts = query.order_by(CRMContact.created_at.desc()).all()
    return [_to_response(db, c) for c in contacts]


@router.get("/{contact_id}", response_model=CRMContactResponse)
async def get_contact(
    contact_id: int,
    _: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    return _to_response(db, _get_or_404(db, contact_id))


@router.put("/{contact_id}", response_model=CRMContactResponse)
async def update_contact(
    contact_id: int,
    body: CRMContactUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    contact = _get_or_404(db, contact_id)
    data = body.model_dump(exclude_unset=True)
    if "email" in data:
        normalized = normalize_email(data.get("email"))
        if normalized and normalized != contact.normalized_email:
            clash = db.query(CRMContact).filter(
                CRMContact.normalized_email == normalized,
                CRMContact.id != contact_id,
            ).first()
            if clash:
                raise HTTPException(status_code=409, detail="A contact with this email already exists.")
        contact.normalized_email = normalized
    for key, value in data.items():
        setattr(contact, key, value)
    db.commit()
    db.refresh(contact)
    log_audit(db, "contact.updated", "contact", contact.id, "Updated contact", principal.user_id)
    return _to_response(db, contact)


@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: int,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
):
    contact = _get_or_404(db, contact_id)
    db.delete(contact)
    db.commit()
    log_audit(db, "contact.deleted", "contact", contact_id, "Deleted contact", principal.user_id)
    return {"message": "Contact deleted."}
