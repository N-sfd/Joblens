"""Unified Companies module API — reuses CRMOrganization, no parallel Client/Vendor models.

Mounted at `/api/crm/organizations` and aliased at `/api/companies`.
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, exists, func, or_
from sqlalchemy.orm import Session

from database import get_db
from models import (
    CRMActivity,
    CRMActivityResponse,
    CRMContact,
    CRMContactListItem,
    CRMOrganization,
    CRMOrganizationCreate,
    CRMOrganizationListItem,
    CRMOrganizationListResponse,
    CRMOrganizationResponse,
    CRMOrganizationUpdate,
    CompanyDuplicateCheckResponse,
    CompanyDuplicateMatch,
    Interview,
    JobRequirement,
    JobRequirementResponse,
    LinkContactBody,
    Offer,
    OrganizationStatusUpdate,
    Submission,
    SubmissionResponse,
)
from ats_auth import AtsPrincipal, get_current_ats_user, require_admin, require_writer
from services.audit import log_audit
from services.crm_normalize import (
    contact_display_name,
    normalize_company_name,
    normalize_company_status,
    normalize_company_type,
    normalize_domain,
    normalize_source_label,
    raw_company_statuses_matching_display,
    raw_company_types_matching_display,
)
from services.job_status import normalize_job_status, raw_statuses_matching_group as job_raw_statuses_matching_group
from services.pipeline_status import (
    normalize_pipeline_stage,
    raw_statuses_matching_group as pipeline_raw_statuses_matching_group,
    stage_order,
)
from routers.crm_contacts import _related_for_contacts, _to_list_item as _contact_list_item

router = APIRouter()

ORG_WIDE_ROLES = ("admin", "manager", "read_only")


def _scope_owner(principal: AtsPrincipal) -> str | None:
    if principal.role in ORG_WIDE_ROLES:
        return None
    return principal.user_id


def _job_org_filter(org_id: int):
    return or_(
        JobRequirement.vendor_id == org_id,
        JobRequirement.client_id == org_id,
        JobRequirement.end_client_id == org_id,
    )


def _can_access(db: Session, org: CRMOrganization, principal: AtsPrincipal) -> bool:
    owner = _scope_owner(principal)
    if owner is None:
        return True
    if org.created_by == owner:
        return True
    linked = (
        db.query(JobRequirement.id)
        .filter(
            JobRequirement.created_by == owner,
            or_(
                JobRequirement.vendor_id == org.id,
                JobRequirement.client_id == org.id,
                JobRequirement.end_client_id == org.id,
            ),
        )
        .first()
    )
    return linked is not None


def _get_org_or_404(db: Session, org_id: int, principal: AtsPrincipal) -> CRMOrganization:
    org = db.query(CRMOrganization).filter(CRMOrganization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found.")
    if not _can_access(db, org, principal):
        raise HTTPException(status_code=403, detail="You do not have access to this organization.")
    return org


def _open_job_status_filter():
    known, includes_unmapped = job_raw_statuses_matching_group("open")
    from services.job_status import _STATUS_DISPLAY_MAP
    all_known = set(_STATUS_DISPLAY_MAP.keys())
    if includes_unmapped:
        return or_(
            JobRequirement.status.in_(list(known)),
            ~JobRequirement.status.in_(list(all_known)),
            JobRequirement.status.is_(None),
        )
    return JobRequirement.status.in_(list(known))


def _active_pipeline_status_filter():
    known, includes_unmapped = pipeline_raw_statuses_matching_group("active")
    from services.pipeline_status import _STATUS_DISPLAY_MAP
    all_known = set(_STATUS_DISPLAY_MAP.keys())
    if includes_unmapped:
        return or_(
            Submission.status.in_(list(known)),
            ~Submission.status.in_(list(all_known)),
            Submission.status.is_(None),
        )
    return Submission.status.in_(list(known))


def _placed_status_filter():
    known, _ = pipeline_raw_statuses_matching_group("placed")
    return Submission.status.in_(list(known))


def _related_for_orgs(db: Session, org_ids: list[int]) -> dict[int, dict]:
    if not org_ids:
        return {}

    now = datetime.utcnow()
    open_filter = _open_job_status_filter()
    active_filter = _active_pipeline_status_filter()
    placed_filter = _placed_status_filter()

    contact_counts = dict(
        db.query(CRMContact.organization_id, func.count(CRMContact.id))
        .filter(CRMContact.organization_id.in_(org_ids))
        .group_by(CRMContact.organization_id)
        .all()
    )

    # primary contact: Active Recruiter/Client/Hiring Manager first, else earliest Active, else first
    primary_names: dict[int, str] = {}
    contacts = (
        db.query(CRMContact)
        .filter(CRMContact.organization_id.in_(org_ids))
        .order_by(CRMContact.id.asc())
        .all()
    )
    by_org: dict[int, list[CRMContact]] = {}
    for c in contacts:
        by_org.setdefault(c.organization_id, []).append(c)
    for oid, rows in by_org.items():
        preferred = next(
            (
                c for c in rows
                if (c.status or "Active") == "Active"
                and (c.contact_type or "") in ("Recruiter", "Client Contact", "Hiring Manager")
            ),
            None,
        ) or next((c for c in rows if (c.status or "Active") == "Active"), None) or rows[0]
        primary_names[oid] = contact_display_name(preferred.first_name, preferred.last_name, preferred.email)

    open_job_counts: dict[int, int] = {oid: 0 for oid in org_ids}
    open_job_ids: dict[int, set[int]] = {oid: set() for oid in org_ids}
    for j in db.query(JobRequirement).filter(
        or_(
            JobRequirement.vendor_id.in_(org_ids),
            JobRequirement.client_id.in_(org_ids),
            JobRequirement.end_client_id.in_(org_ids),
        ),
        open_filter,
    ).all():
        for oid in (j.vendor_id, j.client_id, j.end_client_id):
            if oid in open_job_ids:
                open_job_ids[oid].add(j.id)
    open_job_counts = {oid: len(ids) for oid, ids in open_job_ids.items()}

    # Jobs per org for pipeline linking
    jobs_by_org: dict[int, set[int]] = {oid: set() for oid in org_ids}
    for j in db.query(JobRequirement.id, JobRequirement.vendor_id, JobRequirement.client_id, JobRequirement.end_client_id).filter(
        or_(
            JobRequirement.vendor_id.in_(org_ids),
            JobRequirement.client_id.in_(org_ids),
            JobRequirement.end_client_id.in_(org_ids),
        )
    ).all():
        for oid in (j.vendor_id, j.client_id, j.end_client_id):
            if oid in jobs_by_org:
                jobs_by_org[oid].add(j.id)

    pipeline_counts: dict[int, int] = {oid: 0 for oid in org_ids}
    interview_counts: dict[int, int] = {oid: 0 for oid in org_ids}
    offer_counts: dict[int, int] = {oid: 0 for oid in org_ids}
    placement_counts: dict[int, int] = {oid: 0 for oid in org_ids}

    for oid, jids in jobs_by_org.items():
        if not jids:
            # still count vendor-linked submissions
            sub_ids = {
                s[0]
                for s in db.query(Submission.id).filter(
                    Submission.vendor_id == oid,
                    active_filter,
                ).all()
            }
            pipeline_counts[oid] = len(sub_ids)
            interview_counts[oid] = (
                db.query(func.count(Interview.id))
                .join(Submission, Submission.id == Interview.submission_id)
                .filter(Submission.vendor_id == oid)
                .scalar() or 0
            )
            offer_counts[oid] = (
                db.query(func.count(Offer.id))
                .join(Submission, Submission.id == Offer.submission_id)
                .filter(Submission.vendor_id == oid)
                .scalar() or 0
            )
            placement_counts[oid] = (
                db.query(func.count(Submission.id))
                .filter(Submission.vendor_id == oid, placed_filter)
                .scalar() or 0
            )
            continue

        sub_ids = {
            s[0]
            for s in db.query(Submission.id).filter(
                or_(
                    Submission.job_requirement_id.in_(list(jids)),
                    Submission.vendor_id == oid,
                ),
                active_filter,
            ).all()
        }
        pipeline_counts[oid] = len(sub_ids)

        interview_counts[oid] = (
            db.query(func.count(Interview.id))
            .join(Submission, Submission.id == Interview.submission_id)
            .filter(or_(Submission.job_requirement_id.in_(list(jids)), Submission.vendor_id == oid))
            .scalar() or 0
        )
        offer_counts[oid] = (
            db.query(func.count(Offer.id))
            .join(Submission, Submission.id == Offer.submission_id)
            .filter(or_(Submission.job_requirement_id.in_(list(jids)), Submission.vendor_id == oid))
            .scalar() or 0
        )
        placement_counts[oid] = (
            db.query(func.count(Submission.id))
            .filter(
                or_(Submission.job_requirement_id.in_(list(jids)), Submission.vendor_id == oid),
                placed_filter,
            )
            .scalar() or 0
        )

    follow_rows = (
        db.query(CRMActivity)
        .filter(
            CRMActivity.organization_id.in_(org_ids),
            CRMActivity.due_date.isnot(None),
            or_(CRMActivity.status == "Open", CRMActivity.status.is_(None)),
        )
        .order_by(CRMActivity.due_date.asc())
        .all()
    )
    next_fu: dict[int, datetime] = {}
    for row in follow_rows:
        if row.organization_id not in next_fu and row.due_date:
            next_fu[row.organization_id] = row.due_date

    activity_max = dict(
        db.query(CRMActivity.organization_id, func.max(CRMActivity.activity_date))
        .filter(CRMActivity.organization_id.in_(org_ids))
        .group_by(CRMActivity.organization_id)
        .all()
    )
    updated = {
        o.id: o.updated_at
        for o in db.query(CRMOrganization.id, CRMOrganization.updated_at)
        .filter(CRMOrganization.id.in_(org_ids))
        .all()
    }

    out: dict[int, dict] = {}
    for oid in org_ids:
        fu = next_fu.get(oid)
        last_candidates = [d for d in (activity_max.get(oid), updated.get(oid)) if d]
        last = max(last_candidates) if last_candidates else None
        out[oid] = {
            "contact_count": int(contact_counts.get(oid, 0)),
            "open_job_count": int(open_job_counts.get(oid, 0)),
            "active_pipeline_count": int(pipeline_counts.get(oid, 0)),
            "interview_count": int(interview_counts.get(oid, 0)),
            "offer_count": int(offer_counts.get(oid, 0)),
            "placement_count": int(placement_counts.get(oid, 0)),
            "primary_contact_name": primary_names.get(oid),
            "next_follow_up_at": fu,
            "follow_up_overdue": bool(fu and fu < now),
            "last_activity_at": last,
        }
    return out


def _enrich(org: CRMOrganization, related: dict | None = None) -> CRMOrganizationResponse:
    related = related or {}
    data = CRMOrganizationResponse.model_validate(org).model_dump()
    data["organization_type_display"] = normalize_company_type(org.organization_type)
    data["status_display"] = normalize_company_status(org.status)
    data["source_display"] = normalize_source_label(org.source)
    for key in (
        "contact_count", "open_job_count", "active_pipeline_count",
        "interview_count", "offer_count", "placement_count",
        "primary_contact_name", "next_follow_up_at", "follow_up_overdue", "last_activity_at",
    ):
        if key in related:
            data[key] = related[key]
    if not data.get("last_activity_at"):
        data["last_activity_at"] = org.updated_at
    return CRMOrganizationResponse(**data)


def _to_list_item(org: CRMOrganization, related: dict | None = None) -> CRMOrganizationListItem:
    resp = _enrich(org, related)
    dumped = resp.model_dump(exclude={"notes"})
    return CRMOrganizationListItem(**dumped)


def find_company_duplicates(
    db: Session,
    *,
    organization_name: str | None = None,
    website: str | None = None,
    email_domain: str | None = None,
    exclude_id: int | None = None,
) -> list[CompanyDuplicateMatch]:
    matches: list[CompanyDuplicateMatch] = []
    seen: set[int] = set()

    def _add(row: CRMOrganization, reason: str):
        if exclude_id and row.id == exclude_id:
            return
        if row.id in seen:
            return
        seen.add(row.id)
        matches.append(CompanyDuplicateMatch(
            id=row.id,
            organization_name=row.organization_name,
            organization_type=row.organization_type,
            organization_type_display=normalize_company_type(row.organization_type),
            email_domain=row.email_domain,
            status=row.status,
            status_display=normalize_company_status(row.status),
            match_reason=reason,
        ))

    domain = normalize_domain(email_domain or website)
    if domain:
        for row in db.query(CRMOrganization).filter(
            or_(
                CRMOrganization.email_domain == domain,
                CRMOrganization.website.ilike(f"%{domain}%"),
            )
        ).limit(10).all():
            _add(row, "domain")

    norm_name = normalize_company_name(organization_name)
    if norm_name and len(norm_name) >= 2:
        candidates = db.query(CRMOrganization).limit(500).all()
        for row in candidates:
            if normalize_company_name(row.organization_name) == norm_name:
                _add(row, "name")

    return matches


@router.post("/check-duplicates", response_model=CompanyDuplicateCheckResponse)
async def check_duplicates(
    body: dict,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    matches = find_company_duplicates(
        db,
        organization_name=body.get("organization_name") or body.get("name"),
        website=body.get("website"),
        email_domain=body.get("email_domain"),
        exclude_id=body.get("exclude_id"),
    )
    blocked = any(m.match_reason in ("domain", "name") for m in matches)
    return CompanyDuplicateCheckResponse(matches=matches, blocked=blocked)


@router.post("/", response_model=CRMOrganizationResponse, status_code=201)
async def create_organization(
    body: CRMOrganizationCreate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
    force_new: bool = Query(False, description="Admin-only: continue as new despite domain/name duplicate"),
):
    matches = find_company_duplicates(
        db,
        organization_name=body.organization_name,
        website=body.website,
        email_domain=body.email_domain,
    )
    hard = [m for m in matches if m.match_reason in ("domain", "name")]
    if hard and not (force_new and principal.role == "admin"):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "A possible existing company was found.",
                "matches": [m.model_dump() for m in hard],
            },
        )
    data = body.model_dump()
    if not data.get("email_domain"):
        data["email_domain"] = normalize_domain(data.get("website")) or None
    elif data.get("email_domain"):
        data["email_domain"] = normalize_domain(data["email_domain"]) or data["email_domain"]
    if principal.user_id:
        data["created_by"] = principal.user_id
    org = CRMOrganization(**data)
    db.add(org)
    db.commit()
    db.refresh(org)
    log_audit(db, "organization.created", "organization", org.id, f"Created organization {org.organization_name}", principal.user_id)
    related = _related_for_orgs(db, [org.id]).get(org.id, {})
    return _enrich(org, related)


@router.get("/", response_model=CRMOrganizationListResponse)
async def list_organizations(
    q: str | None = Query(None, description="Search organization name, domain, industry"),
    type: str | None = Query(None, description="Filter by organization_type (display or raw)"),
    status: str | None = Query(None),
    source: str | None = Query(None),
    has_open_jobs: bool | None = Query(None),
    has_active_pipeline: bool | None = Query(None),
    has_placements: bool | None = Query(None),
    overdue_follow_up: bool | None = Query(None),
    needs_review: bool | None = Query(None),
    sort: str | None = Query("last_activity", description="last_activity|newest|name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    query = db.query(CRMOrganization)
    owner = _scope_owner(principal)
    if owner:
        linked_org_ids = db.query(JobRequirement.vendor_id).filter(
            JobRequirement.created_by == owner, JobRequirement.vendor_id.isnot(None)
        ).union(
            db.query(JobRequirement.client_id).filter(
                JobRequirement.created_by == owner, JobRequirement.client_id.isnot(None)
            ),
            db.query(JobRequirement.end_client_id).filter(
                JobRequirement.created_by == owner, JobRequirement.end_client_id.isnot(None)
            ),
        )
        query = query.filter(or_(
            CRMOrganization.created_by == owner,
            CRMOrganization.id.in_(linked_org_ids),
        ))

    if type:
        raws = raw_company_types_matching_display(type)
        query = query.filter(CRMOrganization.organization_type.in_(list(raws)))
    if status:
        raws = raw_company_statuses_matching_display(status)
        query = query.filter(CRMOrganization.status.in_(list(raws)))
    if source:
        query = query.filter(CRMOrganization.source.ilike(f"%{source.strip()}%"))
    if needs_review is not None:
        query = query.filter(CRMOrganization.needs_review == needs_review)
    if q:
        term = f"%{q.strip()}%"
        query = query.filter(or_(
            CRMOrganization.organization_name.ilike(term),
            CRMOrganization.email_domain.ilike(term),
            CRMOrganization.industry.ilike(term),
            CRMOrganization.website.ilike(term),
        ))

    open_filter = _open_job_status_filter()
    open_job_exists = exists().where(and_(
        or_(
            JobRequirement.vendor_id == CRMOrganization.id,
            JobRequirement.client_id == CRMOrganization.id,
            JobRequirement.end_client_id == CRMOrganization.id,
        ),
        open_filter,
    ))
    if has_open_jobs is True:
        query = query.filter(open_job_exists)
    elif has_open_jobs is False:
        query = query.filter(~open_job_exists)

    active_filter = _active_pipeline_status_filter()
    pipeline_exists = exists().where(or_(
        and_(
            or_(
                JobRequirement.vendor_id == CRMOrganization.id,
                JobRequirement.client_id == CRMOrganization.id,
                JobRequirement.end_client_id == CRMOrganization.id,
            ),
            Submission.job_requirement_id == JobRequirement.id,
            active_filter,
        ),
        and_(Submission.vendor_id == CRMOrganization.id, active_filter),
    ))
    if has_active_pipeline is True:
        query = query.filter(pipeline_exists)
    elif has_active_pipeline is False:
        query = query.filter(~pipeline_exists)

    placed_filter = _placed_status_filter()
    placement_exists = exists().where(or_(
        and_(
            or_(
                JobRequirement.vendor_id == CRMOrganization.id,
                JobRequirement.client_id == CRMOrganization.id,
                JobRequirement.end_client_id == CRMOrganization.id,
            ),
            Submission.job_requirement_id == JobRequirement.id,
            placed_filter,
        ),
        and_(Submission.vendor_id == CRMOrganization.id, placed_filter),
    ))
    if has_placements is True:
        query = query.filter(placement_exists)
    elif has_placements is False:
        query = query.filter(~placement_exists)

    now = datetime.utcnow()
    overdue_exists = exists().where(and_(
        CRMActivity.organization_id == CRMOrganization.id,
        CRMActivity.due_date.isnot(None),
        CRMActivity.due_date < now,
        or_(CRMActivity.status == "Open", CRMActivity.status.is_(None)),
    ))
    if overdue_follow_up is True:
        query = query.filter(overdue_exists)
    elif overdue_follow_up is False:
        query = query.filter(~overdue_exists)

    total = query.count()
    sort_key = (sort or "last_activity").lower()
    if sort_key == "name":
        query = query.order_by(CRMOrganization.organization_name.asc())
    elif sort_key == "newest":
        query = query.order_by(CRMOrganization.created_at.desc())
    else:
        query = query.order_by(CRMOrganization.updated_at.desc())

    orgs = query.offset((page - 1) * page_size).limit(page_size).all()
    related = _related_for_orgs(db, [o.id for o in orgs])
    if sort_key in ("last_activity", "updated", ""):
        orgs = sorted(
            orgs,
            key=lambda o: related.get(o.id, {}).get("last_activity_at") or o.updated_at or datetime.min,
            reverse=True,
        )
    items = [_to_list_item(o, related.get(o.id, {})) for o in orgs]
    total_pages = max(1, (total + page_size - 1) // page_size) if total else 0
    return CRMOrganizationListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{org_id}", response_model=CRMOrganizationResponse)
async def get_organization(
    org_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    org = _get_org_or_404(db, org_id, principal)
    related = _related_for_orgs(db, [org.id]).get(org.id, {})
    return _enrich(org, related)


@router.put("/{org_id}", response_model=CRMOrganizationResponse)
async def update_organization(
    org_id: int,
    body: CRMOrganizationUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    org = _get_org_or_404(db, org_id, principal)
    data = body.model_dump(exclude_unset=True)
    if "email_domain" in data and data["email_domain"]:
        data["email_domain"] = normalize_domain(data["email_domain"]) or data["email_domain"]
    if "website" in data and data.get("website") and not data.get("email_domain") and not org.email_domain:
        data.setdefault("email_domain", normalize_domain(data["website"]) or None)
    for key, value in data.items():
        setattr(org, key, value)
    db.commit()
    db.refresh(org)
    log_audit(db, "organization.updated", "organization", org.id, f"Updated organization {org.organization_name}", principal.user_id)
    related = _related_for_orgs(db, [org.id]).get(org.id, {})
    return _enrich(org, related)


@router.patch("/{org_id}/status", response_model=CRMOrganizationResponse)
async def update_organization_status(
    org_id: int,
    body: OrganizationStatusUpdate,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    org = _get_org_or_404(db, org_id, principal)
    org.status = body.status
    db.commit()
    db.refresh(org)
    log_audit(db, "organization.status", "organization", org.id, f"Status → {body.status}", principal.user_id)
    related = _related_for_orgs(db, [org.id]).get(org.id, {})
    return _enrich(org, related)


@router.get("/{org_id}/contacts", response_model=list[CRMContactListItem])
async def organization_contacts(
    org_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_org_or_404(db, org_id, principal)
    contacts = (
        db.query(CRMContact)
        .filter(CRMContact.organization_id == org_id)
        .order_by(CRMContact.last_name.asc(), CRMContact.first_name.asc())
        .all()
    )
    related = _related_for_contacts(db, [c.id for c in contacts])
    return [_contact_list_item(c, related.get(c.id, {})) for c in contacts]


@router.post("/{org_id}/contacts", response_model=CRMContactListItem)
async def link_contact(
    org_id: int,
    body: LinkContactBody,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    _get_org_or_404(db, org_id, principal)
    contact = db.query(CRMContact).filter(CRMContact.id == body.contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")
    contact.organization_id = org_id
    db.commit()
    db.refresh(contact)
    log_audit(db, "organization.link_contact", "organization", org_id, f"Linked contact {contact.id}", principal.user_id)
    related = _related_for_contacts(db, [contact.id]).get(contact.id, {})
    return _contact_list_item(contact, related)


@router.delete("/{org_id}/contacts/{contact_id}")
async def unlink_contact(
    org_id: int,
    contact_id: int,
    principal: AtsPrincipal = Depends(require_writer),
    db: Session = Depends(get_db),
):
    _get_org_or_404(db, org_id, principal)
    contact = db.query(CRMContact).filter(CRMContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")
    if contact.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Contact is not linked to this organization.")
    contact.organization_id = None
    db.commit()
    log_audit(db, "organization.unlink_contact", "organization", org_id, f"Unlinked contact {contact_id}", principal.user_id)
    return {"message": "Contact unlinked.", "contact_id": contact_id, "organization_id": org_id}


@router.get("/{org_id}/jobs", response_model=list[JobRequirementResponse])
async def organization_jobs(
    org_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_org_or_404(db, org_id, principal)
    jobs = (
        db.query(JobRequirement)
        .filter(_job_org_filter(org_id))
        .order_by(JobRequirement.updated_at.desc())
        .all()
    )
    out = []
    for job in jobs:
        data = JobRequirementResponse.model_validate(job).model_dump()
        data["status_display"] = normalize_job_status(job.status)
        out.append(JobRequirementResponse(**data))
    return out


@router.get("/{org_id}/pipeline", response_model=list[SubmissionResponse])
async def organization_pipeline(
    org_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_org_or_404(db, org_id, principal)
    job_ids = [
        r[0]
        for r in db.query(JobRequirement.id).filter(_job_org_filter(org_id)).all()
    ]
    clauses = [Submission.vendor_id == org_id]
    if job_ids:
        clauses.append(Submission.job_requirement_id.in_(job_ids))
    rows = (
        db.query(Submission)
        .filter(or_(*clauses))
        .order_by(Submission.updated_at.desc())
        .all()
    )
    out = []
    for sub in rows:
        data = SubmissionResponse.model_validate(sub).model_dump()
        display = normalize_pipeline_stage(sub.status)
        data["status_display"] = display
        data["stage_order"] = stage_order(display)
        out.append(SubmissionResponse(**data))
    return out


@router.get("/{org_id}/activities", response_model=list[CRMActivityResponse])
async def organization_activities(
    org_id: int,
    principal: AtsPrincipal = Depends(get_current_ats_user),
    db: Session = Depends(get_db),
):
    _get_org_or_404(db, org_id, principal)
    return (
        db.query(CRMActivity)
        .filter(CRMActivity.organization_id == org_id)
        .order_by(CRMActivity.activity_date.desc(), CRMActivity.created_at.desc())
        .all()
    )


@router.delete("/{org_id}")
async def delete_organization(
    org_id: int,
    principal: AtsPrincipal = Depends(require_admin),
    db: Session = Depends(get_db),
    confirm: bool = Query(False, description="Required for hard delete when no history"),
):
    org = _get_org_or_404(db, org_id, principal)
    job_count = db.query(func.count(JobRequirement.id)).filter(_job_org_filter(org_id)).scalar() or 0
    activity_count = (
        db.query(func.count(CRMActivity.id))
        .filter(CRMActivity.organization_id == org_id)
        .scalar() or 0
    )
    contact_count = (
        db.query(func.count(CRMContact.id))
        .filter(CRMContact.organization_id == org_id)
        .scalar() or 0
    )
    pipeline_count = (
        db.query(func.count(Submission.id))
        .filter(Submission.vendor_id == org_id)
        .scalar() or 0
    )
    has_history = bool(job_count or activity_count or contact_count or pipeline_count)

    if has_history:
        org.status = "Archived"
        db.commit()
        log_audit(db, "organization.archived", "organization", org_id, "Archived (history present)", principal.user_id)
        return {
            "message": "Organization has history — status set to Archived.",
            "archived": True,
            "id": org_id,
        }

    if not confirm:
        org.status = "Archived"
        db.commit()
        log_audit(db, "organization.archived", "organization", org_id, "Archived (confirm not set)", principal.user_id)
        return {
            "message": "Organization archived. Pass confirm=true to hard-delete organizations with no history.",
            "archived": True,
            "id": org_id,
        }

    name = org.organization_name
    db.delete(org)
    db.commit()
    log_audit(db, "organization.deleted", "organization", org_id, f"Deleted organization {name}", principal.user_id)
    return {"message": "Organization deleted.", "deleted": True, "id": org_id}
