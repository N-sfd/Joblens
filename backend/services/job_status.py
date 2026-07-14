"""Job status/source normalization for the unified Jobs module.

`JobRequirement.status` keeps its existing granular legacy values (New,
Parsed, Ready for Match, Interview, Selected, ...) — no migration rewrites
existing rows. These functions derive a normalized *display* status/source
label for the API/UI without altering stored data. New jobs created or
status-changed through the unified Jobs module use the canonical 5-value set
directly going forward.
"""

from __future__ import annotations

JOB_STATUS_GROUPS = ("Draft", "Open", "On Hold", "Filled", "Closed")

# Every legacy JobRequirement.status value in use today, mapped to its
# canonical display status. Unknown/future raw values default to "Open"
# (visible/actionable) rather than silently disappearing into "Closed".
_STATUS_DISPLAY_MAP = {
    "Draft": "Draft",
    "New": "Draft",
    "Needs Review": "Draft",
    "Parsed": "Draft",
    "Open": "Open",
    "Ready for Match": "Open",
    "Matched": "Open",
    "Sent to Employee": "Open",
    "Employee Interested": "Open",
    "Interested": "Open",
    "Submitted": "Open",
    "Interview": "Open",
    "On Hold": "On Hold",
    "Selected": "Filled",
    "Filled": "Filled",
    "Closed": "Closed",
    "Rejected": "Closed",
    "Duplicate": "Closed",
    "Spam": "Closed",
}

# "Open Jobs" dashboard/list definition: excludes Draft, Filled, Closed —
# includes Open and On Hold. Shared by the dashboard count and the Jobs
# module's `status_group=open` filter so they never diverge.
OPEN_STATUS_GROUP_DISPLAY = {"Open", "On Hold"}


def normalize_job_status(raw_status: str | None) -> str:
    """Map a raw (possibly legacy) status value to one of JOB_STATUS_GROUPS."""
    if not raw_status:
        return "Draft"
    return _STATUS_DISPLAY_MAP.get(raw_status, "Open")


def is_open_status_group(raw_status: str | None) -> bool:
    return normalize_job_status(raw_status) in OPEN_STATUS_GROUP_DISPLAY


def matches_status_group(raw_status: str | None, group: str) -> bool:
    """group: "open" (Open+On Hold) or an exact canonical status name."""
    display = normalize_job_status(raw_status)
    if group.lower() == "open":
        return display in OPEN_STATUS_GROUP_DISPLAY
    return display.lower() == group.lower()


_ALL_KNOWN_RAW_STATUSES = set(_STATUS_DISPLAY_MAP.keys())


def raw_statuses_matching_group(group: str) -> tuple[set[str], bool]:
    """SQL-filterable equivalent of `matches_status_group`.

    Returns (known raw values that match, whether unmapped/future raw values
    also match). Used to build a `.status.in_(...)` filter that is guaranteed
    to agree with `matches_status_group`/`normalize_job_status` — the same
    definition powers both the Dashboard's Open Jobs count and this filter.
    """
    wanted = OPEN_STATUS_GROUP_DISPLAY if group.lower() == "open" else {group.strip()}
    known_matches = {
        raw for raw, display in _STATUS_DISPLAY_MAP.items()
        if display in wanted or display.lower() in {w.lower() for w in wanted}
    }
    # Unmapped/future raw values default-normalize to "Open" (see normalize_job_status).
    includes_unmapped = "Open" in wanted
    return known_matches, includes_unmapped


def normalize_source_label(raw_source: str | None) -> str:
    """Zoho Email | Manual Entry | API Import | Other — never show raw values."""
    if not raw_source or not raw_source.strip():
        return "Other"
    low = raw_source.strip().lower()
    if "zoho" in low:
        return "Zoho Email"
    if "api" in low:
        return "API Import"
    if "manual" in low or "paste" in low or "copy" in low:
        return "Manual Entry"
    return "Other"


def is_zoho_source(raw_source: str | None) -> bool:
    return bool(raw_source) and "zoho" in raw_source.strip().lower()
