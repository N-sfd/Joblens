"""Phase 5 M2 — map JobLens profile → Greenhouse fill values (minimized).

Never returns full profile. Never stores employer form values.
Work authorization / sponsorship only when user_confirmed.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from auth import Owner
from models import Profile, User, WorkAuthorization, ProfessionalLinks, ExperienceEntry

# M2 fillable normalized keys (uploads excluded).
FILLABLE_FIELDS = frozenset({
    "first_name", "last_name", "full_name", "email", "phone",
    "city", "state", "country", "postal_code",
    "linkedin_url", "portfolio_url", "github_url",
    "current_company", "current_title",
    "work_authorization", "sponsorship_required",
})

UPLOAD_FIELDS = frozenset({
    "resume_upload", "cover_letter_upload", "supporting_document",
    "portfolio_file", "certification_file",
})

SENSITIVE_FILL_FIELDS = frozenset({"work_authorization", "sponsorship_required"})

NEVER_FILL_CLASSIFICATIONS = frozenset({
    "sensitive_question", "legal_attestation", "unsupported", "unknown", "custom_question",
})


def _loads(raw: Optional[str], default):
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default


def _split_name(full: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    if not full or not str(full).strip():
        return None, None
    parts = str(full).strip().split()
    if len(parts) == 1:
        return parts[0], None
    return parts[0], parts[-1]


def _bool_to_yes_no(value: Optional[bool]) -> Optional[str]:
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    return None


def build_profile_value_map(db: Session, owner: Owner) -> dict[str, Any]:
    """Return {normalized_field: value} for available profile data. No extras."""
    out: dict[str, Any] = {}
    if owner.user_id is None:
        return out

    user = db.query(User).filter(User.id == owner.user_id).first()
    profile = db.query(Profile).filter(Profile.user_id == owner.user_id).first()
    if not profile and not user:
        return out

    full_name = (profile.full_name if profile else None) or (user.name if user else None)
    first, last = _split_name(full_name)
    if full_name:
        out["full_name"] = full_name
    if first:
        out["first_name"] = first
    if last:
        out["last_name"] = last
    if user and user.email:
        out["email"] = user.email

    if profile:
        if profile.phone:
            out["phone"] = profile.phone
        if profile.city:
            out["city"] = profile.city
        if profile.state:
            out["state"] = profile.state
        if profile.country:
            out["country"] = profile.country
        if profile.postal_code:
            out["postal_code"] = profile.postal_code

        links = ProfessionalLinks(**(_loads(profile.professional_links_json, {}) or {}))
        linkedin = profile.linkedin_url or links.linkedin
        portfolio = profile.portfolio_url or links.portfolio or links.personal_website
        github = links.github
        if linkedin:
            out["linkedin_url"] = linkedin
        if portfolio:
            out["portfolio_url"] = portfolio
        if github:
            out["github_url"] = github

        exp_list = _loads(profile.experience, [])
        if isinstance(exp_list, list) and exp_list:
            first_exp = exp_list[0] if isinstance(exp_list[0], dict) else {}
            if first_exp.get("company"):
                out["current_company"] = first_exp["company"]
            if first_exp.get("title"):
                out["current_title"] = first_exp["title"]
        if profile.headline and "current_title" not in out:
            out["current_title"] = profile.headline

        auth = WorkAuthorization(**(_loads(profile.work_authorization_json, {}) or {}))
        if auth.user_confirmed:
            if auth.current_authorization:
                out["work_authorization"] = auth.current_authorization
                out["_work_authorization_confirmed"] = True
                out["_work_authorization_confirmed_at"] = (
                    auth.confirmed_at.isoformat() if isinstance(auth.confirmed_at, datetime) else (
                        str(auth.confirmed_at) if auth.confirmed_at else None
                    )
                )
            yn = _bool_to_yes_no(auth.sponsorship_required_now)
            if yn is not None:
                out["sponsorship_required"] = yn
                out["_sponsorship_confirmed"] = True
                out["_sponsorship_confirmed_at"] = out.get("_work_authorization_confirmed_at")

    return out


def readiness_summary(values: dict[str, Any], owner: Owner) -> dict[str, Any]:
    checks = {
        "joblens_connected": True,
        "profile_available": owner.user_id is not None and bool(values or owner.user_id),
        "email_available": bool(values.get("email")),
        "phone_available": bool(values.get("phone")),
        "location_available": bool(values.get("city") or values.get("country")),
        "professional_links_available": bool(
            values.get("linkedin_url") or values.get("portfolio_url") or values.get("github_url")
        ),
        "work_authorization_reviewed": bool(values.get("_work_authorization_confirmed")),
        "sponsorship_answer_reviewed": bool(values.get("_sponsorship_confirmed")),
    }
    if owner.user_id is None:
        status = "Not Ready"
        checks["profile_available"] = False
    elif not checks["email_available"] and not checks["phone_available"]:
        status = "Not Ready"
    elif not checks["work_authorization_reviewed"] or not checks["sponsorship_answer_reviewed"]:
        status = "Review Required"
    elif not all([checks["email_available"], checks["phone_available"], checks["location_available"]]):
        status = "Some Information Missing"
    else:
        status = "Ready to Fill"
    return {"status": status, "checks": checks}


def map_detected_fields(
    detected: list[dict[str, Any]],
    values: dict[str, Any],
) -> list[dict[str, Any]]:
    """Return mapping rows for UI. Includes approved_value only for fillable fields."""
    rows = []
    for f in detected:
        norm = f.get("normalized_field_name")
        classification = f.get("classification") or "unknown"
        is_upload = bool(f.get("is_upload")) or norm in UPLOAD_FIELDS
        key = f.get("external_field_key") or f.get("field_label") or ""

        base = {
            "external_field_key": key,
            "field_label": f.get("field_label") or key,
            "field_type": f.get("field_type") or "text",
            "normalized_field_name": norm,
            "is_required": bool(f.get("is_required")),
            "is_upload": is_upload,
            "classification": classification,
            "options": f.get("options") or [],
            "detection_confidence": float(f.get("confidence") or 0),
            "approved_value": None,
            "sensitivity_category": "normal",
            "requires_individual_confirmation": False,
            "mapping_confidence": 0.0,
            "mapping_status": "Unsupported",
            "profile_source_timestamp": None,
            "selectable": False,
        }

        if is_upload or (norm in UPLOAD_FIELDS):
            base["mapping_status"] = "Manual Upload Required"
            base["sensitivity_category"] = "upload"
            rows.append(base)
            continue

        if classification in NEVER_FILL_CLASSIFICATIONS and norm not in FILLABLE_FIELDS:
            if classification == "sensitive_question":
                base["mapping_status"] = "Sensitive — Manual Entry"
                base["sensitivity_category"] = "sensitive"
            elif classification == "legal_attestation":
                base["mapping_status"] = "Sensitive — Manual Entry"
                base["sensitivity_category"] = "legal"
            elif classification == "custom_question":
                base["mapping_status"] = "Unsupported"
                base["sensitivity_category"] = "custom"
            else:
                base["mapping_status"] = "Unsupported"
            rows.append(base)
            continue

        if norm not in FILLABLE_FIELDS:
            base["mapping_status"] = "Unsupported"
            rows.append(base)
            continue

        if norm in SENSITIVE_FILL_FIELDS:
            base["sensitivity_category"] = "employment_eligibility"
            base["requires_individual_confirmation"] = True
            confirmed_flag = (
                values.get("_work_authorization_confirmed")
                if norm == "work_authorization"
                else values.get("_sponsorship_confirmed")
            )
            ts = (
                values.get("_work_authorization_confirmed_at")
                if norm == "work_authorization"
                else values.get("_sponsorship_confirmed_at")
            )
            val = values.get(norm)
            if not confirmed_flag or val is None:
                base["mapping_status"] = "Needs Review"
                base["mapping_confidence"] = 0.4
            else:
                base["approved_value"] = str(val)
                base["mapping_status"] = "Ready"
                base["mapping_confidence"] = 0.95
                base["profile_source_timestamp"] = ts
                base["selectable"] = True
            rows.append(base)
            continue

        val = values.get(norm)
        if val is None or str(val).strip() == "":
            base["mapping_status"] = "Missing in Profile"
            base["mapping_confidence"] = 0.0
        else:
            base["approved_value"] = str(val)
            base["mapping_status"] = "Ready"
            base["mapping_confidence"] = 0.9
            base["selectable"] = True
            base["profile_source_timestamp"] = datetime.utcnow().isoformat() + "Z"
        rows.append(base)

    return rows


def permitted_normalized_fields() -> list[str]:
    return sorted(FILLABLE_FIELDS - SENSITIVE_FILL_FIELDS) + sorted(SENSITIVE_FILL_FIELDS)
