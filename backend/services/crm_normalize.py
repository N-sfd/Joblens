"""Contact / company type and source normalization for Unified Contacts.

CRMContact.contact_type and CRMOrganization.organization_type keep existing
stored strings. These helpers map to Phase 6 display labels without rewriting
rows. Documented limitation: schema supports a single primary contact_type /
organization_type (not multi-role arrays).
"""

from __future__ import annotations

CONTACT_DISPLAY_TYPES = (
    "Recruiter",
    "Hiring Manager",
    "Client Contact",
    "Vendor Contact",
    "Candidate Contact",
    "Other",
)

CONTACT_DISPLAY_STATUSES = ("Active", "Inactive", "Archived")

COMPANY_DISPLAY_TYPES = (
    "Client",
    "Vendor",
    "End Client",
    "Recruiting Agency",
    "Employer",
    "Partner",
    "Other",
)

SOURCE_DISPLAY_LABELS = (
    "Zoho Email",
    "Job Import",
    "Manual Entry",
    "Candidate Referral",
    "API Import",
    "Other",
)

_CONTACT_TYPE_MAP = {
    "Recruiter": "Recruiter",
    "Hiring Manager": "Hiring Manager",
    "Client Contact": "Client Contact",
    "Client Manager": "Client Contact",
    "Account Manager": "Client Contact",
    "Vendor Contact": "Vendor Contact",
    "Vendor Manager": "Vendor Contact",
    "Candidate Contact": "Candidate Contact",
    "HR Contact": "Other",
    "Other": "Other",
}

_COMPANY_TYPE_MAP = {
    "Client": "Client",
    "Direct Client": "Client",
    "Vendor": "Vendor",
    "Staffing Vendor": "Vendor",
    "End Client": "End Client",
    "Recruiting Agency": "Recruiting Agency",
    "Employer": "Employer",
    "Partner": "Partner",
    "Implementation Partner": "Partner",
    "Managed Service Provider": "Partner",
    "Government Agency": "Other",
    "Other": "Other",
}

_CONTACT_STATUS_MAP = {
    "Active": "Active",
    "Inactive": "Inactive",
    "Archived": "Archived",
    "Do Not Contact": "Inactive",
    "Bounced Email": "Inactive",
    "Unsubscribed": "Inactive",
    "Prospect": "Active",
}

_ORG_STATUS_MAP = {
    "Active": "Active",
    "Inactive": "Inactive",
    "Archived": "Archived",
    "Prospect": "Active",
    "Blocked": "Inactive",
    "Do Not Work With": "Inactive",
}


def normalize_contact_type(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return "Other"
    return _CONTACT_TYPE_MAP.get(str(raw).strip(), "Other")


def normalize_company_type(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return "Other"
    return _COMPANY_TYPE_MAP.get(str(raw).strip(), "Other")


def normalize_contact_status(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return "Active"
    return _CONTACT_STATUS_MAP.get(str(raw).strip(), "Active")


def normalize_company_status(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return "Active"
    return _ORG_STATUS_MAP.get(str(raw).strip(), "Active")


def normalize_source_label(raw: str | None) -> str:
    if not raw or not str(raw).strip():
        return "Other"
    low = raw.strip().lower()
    if "zoho" in low:
        return "Zoho Email"
    if "job" in low and "import" in low:
        return "Job Import"
    if "referral" in low or "candidate" in low:
        return "Candidate Referral"
    if "api" in low:
        return "API Import"
    if "manual" in low or "paste" in low:
        return "Manual Entry"
    return "Other"


def normalize_email(email: str | None) -> str:
    if not email:
        return ""
    return email.strip().lower()


def normalize_phone(phone: str | None) -> str:
    if not phone:
        return ""
    return "".join(ch for ch in phone if ch.isdigit())


def normalize_company_name(name: str | None) -> str:
    if not name:
        return ""
    cleaned = "".join(ch.lower() if ch.isalnum() or ch.isspace() else " " for ch in name)
    return " ".join(cleaned.split())


def normalize_domain(website_or_domain: str | None) -> str:
    if not website_or_domain:
        return ""
    w = website_or_domain.strip().lower()
    for prefix in ("https://", "http://", "www."):
        if w.startswith(prefix):
            w = w[len(prefix):]
    return w.split("/")[0].strip()


def raw_contact_types_matching_display(display: str) -> set[str]:
    return {raw for raw, mapped in _CONTACT_TYPE_MAP.items() if mapped == display} | {display}


def raw_company_types_matching_display(display: str) -> set[str]:
    return {raw for raw, mapped in _COMPANY_TYPE_MAP.items() if mapped == display} | {display}


def raw_contact_statuses_matching_display(display: str) -> set[str]:
    return {raw for raw, mapped in _CONTACT_STATUS_MAP.items() if mapped == display} | {display}


def raw_company_statuses_matching_display(display: str) -> set[str]:
    return {raw for raw, mapped in _ORG_STATUS_MAP.items() if mapped == display} | {display}


def contact_display_name(
    first_name: str | None = None,
    last_name: str | None = None,
    email: str | None = None,
) -> str:
    name = f"{first_name or ''} {last_name or ''}".strip()
    if name:
        return name
    if email and str(email).strip():
        return str(email).strip()
    return "Unknown"
