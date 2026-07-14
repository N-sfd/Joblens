"""Candidate status normalization for the unified Candidates module.

`Employee.status` keeps existing granular values (Active, Bench, On Project,
Available Soon, Inactive, Do Not Contact, Former Employee, …) — no migration
rewrites existing rows. These functions derive a normalized *display* status
for the API/UI without altering stored data.

Canonical display statuses (Phase 4):
  New | Active | Submitted | Interviewing | Offered | Placed | Rejected | Inactive
"""

from __future__ import annotations

CANDIDATE_STATUS_GROUPS = (
    "New",
    "Active",
    "Submitted",
    "Interviewing",
    "Offered",
    "Placed",
    "Rejected",
    "Inactive",
)

# Legacy Employee.status → display status. Unknown/future values stay visible
# and map to Active (actionable) rather than disappearing into Inactive.
_STATUS_DISPLAY_MAP = {
    "New": "New",
    "Active": "Active",
    "Bench": "Active",
    "On Project": "Active",
    "Available Soon": "Active",
    "Submitted": "Submitted",
    "Interviewing": "Interviewing",
    "Interview": "Interviewing",
    "Offered": "Offered",
    "Offer": "Offered",
    "Placed": "Placed",
    "Selected": "Placed",
    "Rejected": "Rejected",
    "Inactive": "Inactive",
    "Do Not Contact": "Inactive",
    "Former Employee": "Inactive",
    "Archived": "Inactive",
}

# Dashboard "Active Candidates" — same definition as status_group=active filter.
ACTIVE_STATUS_GROUP_DISPLAY = {"New", "Active", "Submitted", "Interviewing", "Offered"}

INACTIVE_DISPLAY = {"Inactive", "Rejected", "Placed"}


def normalize_candidate_status(raw_status: str | None) -> str:
    """Map a raw (possibly legacy) Employee.status to a canonical display status."""
    if not raw_status or not str(raw_status).strip():
        return "Active"
    return _STATUS_DISPLAY_MAP.get(str(raw_status).strip(), "Active")


def is_active_status_group(raw_status: str | None) -> bool:
    return normalize_candidate_status(raw_status) in ACTIVE_STATUS_GROUP_DISPLAY


def matches_status_group(raw_status: str | None, group: str) -> bool:
    """group: "active" (pipeline-active) or an exact canonical status name."""
    display = normalize_candidate_status(raw_status)
    g = (group or "").strip().lower()
    if g == "active":
        return display in ACTIVE_STATUS_GROUP_DISPLAY
    if g == "inactive_group":
        return display in INACTIVE_DISPLAY
    return display.lower() == g


def raw_statuses_matching_group(group: str) -> tuple[set[str], bool]:
    """SQL-filterable equivalent of `matches_status_group`.

    Returns (known raw values that match, whether unmapped/future raw values
    also match). Unmapped values default-normalize to Active.
    """
    g = (group or "").strip()
    gl = g.lower()
    if gl == "active":
        wanted = set(ACTIVE_STATUS_GROUP_DISPLAY)
    elif gl in ("inactive_group", "inactive-group"):
        wanted = set(INACTIVE_DISPLAY)
    else:
        wanted = {g}
    known_matches = {
        raw for raw, display in _STATUS_DISPLAY_MAP.items()
        if display in wanted or display.lower() in {w.lower() for w in wanted}
    }
    includes_unmapped = "Active" in wanted
    return known_matches, includes_unmapped


def normalize_phone(raw: str | None) -> str:
    """Digits-only phone for duplicate matching."""
    if not raw:
        return ""
    return "".join(ch for ch in raw if ch.isdigit())


def normalize_email(raw: str | None) -> str:
    if not raw:
        return ""
    return raw.strip().lower()
