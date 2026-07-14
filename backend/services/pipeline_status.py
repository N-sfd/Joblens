"""Pipeline stage normalization for the unified Pipeline module.

`Submission.status` keeps existing raw values (Draft, Employee Contacted,
Submitted, Interview, Selected, …). These helpers derive display stages and
stage groups without rewriting stored rows. New transitions write the preferred
raw status for each display stage going forward.

Canonical display stages (Phase 5):
  Identified | Contacted | Interested | Submitted | Client Review |
  Interview Scheduled | Interview Completed | Offer | Placed | Rejected | Withdrawn
"""

from __future__ import annotations

PIPELINE_STAGES = (
    "Identified",
    "Contacted",
    "Interested",
    "Submitted",
    "Client Review",
    "Interview Scheduled",
    "Interview Completed",
    "Offer",
    "Placed",
    "Rejected",
    "Withdrawn",
)

STAGE_ORDER: dict[str, int] = {s: i for i, s in enumerate(PIPELINE_STAGES)}

TERMINAL_STAGES = frozenset({"Placed", "Rejected", "Withdrawn"})

ACTIVE_STAGES = frozenset(s for s in PIPELINE_STAGES if s not in TERMINAL_STAGES)

STAGE_GROUPS: dict[str, frozenset[str]] = {
    "active": ACTIVE_STAGES,
    "pre_submission": frozenset({"Identified", "Contacted", "Interested"}),
    "submitted": frozenset({"Submitted", "Client Review"}),
    "interview": frozenset({"Interview Scheduled", "Interview Completed"}),
    "offer": frozenset({"Offer"}),
    "placed": frozenset({"Placed"}),
    "closed": frozenset({"Rejected", "Withdrawn"}),
}

_STATUS_DISPLAY_MAP = {
    "New": "Identified",
    "Draft": "Identified",
    "Identified": "Identified",
    "Contacted": "Contacted",
    "Employee Contacted": "Contacted",
    "Interested": "Interested",
    "Qualified": "Interested",
    "Employee Interested": "Interested",
    "Submitted": "Submitted",
    "Sent": "Submitted",
    "Client Review": "Client Review",
    "Under Review": "Client Review",
    "Interview": "Interview Scheduled",
    "Interviewing": "Interview Scheduled",
    "Scheduled": "Interview Scheduled",
    "Interview Scheduled": "Interview Scheduled",
    "Interview Completed": "Interview Completed",
    "Offer": "Offer",
    "Offer Draft": "Offer",
    "Offer Extended": "Offer",
    "Offer Accepted": "Offer",
    "Selected": "Placed",
    "Hired": "Placed",
    "Placed": "Placed",
    "Rejected": "Rejected",
    "Declined": "Rejected",
    "Withdrawn": "Withdrawn",
    "Closed": "Withdrawn",
}

STAGE_TO_RAW = {
    "Identified": "Draft",
    "Contacted": "Employee Contacted",
    "Interested": "Employee Interested",
    "Submitted": "Submitted",
    "Client Review": "Client Review",
    "Interview Scheduled": "Interview",
    "Interview Completed": "Interview",
    "Offer": "Offer",
    "Placed": "Selected",
    "Rejected": "Rejected",
    "Withdrawn": "Withdrawn",
}

FORWARD_EDGES: dict[str, frozenset[str]] = {
    "Identified": frozenset({"Contacted", "Interested", "Submitted", "Rejected", "Withdrawn"}),
    "Contacted": frozenset({"Interested", "Submitted", "Identified", "Rejected", "Withdrawn"}),
    "Interested": frozenset({"Submitted", "Contacted", "Rejected", "Withdrawn"}),
    "Submitted": frozenset({"Client Review", "Interview Scheduled", "Rejected", "Withdrawn"}),
    "Client Review": frozenset({"Interview Scheduled", "Submitted", "Rejected", "Withdrawn"}),
    "Interview Scheduled": frozenset({"Interview Completed", "Offer", "Client Review", "Rejected", "Withdrawn"}),
    "Interview Completed": frozenset({"Offer", "Interview Scheduled", "Rejected", "Withdrawn"}),
    "Offer": frozenset({"Placed", "Interview Completed", "Rejected", "Withdrawn"}),
    "Placed": frozenset(),
    "Rejected": frozenset(),
    "Withdrawn": frozenset(),
}

PROTECTED_BACKWARD_FROM = frozenset({
    "Submitted", "Client Review", "Interview Scheduled", "Interview Completed", "Offer", "Placed",
})

CREATE_ALLOWED_STAGES = frozenset({"Identified", "Contacted", "Interested", "Submitted"})

REJECTION_REASONS = (
    "Skills mismatch",
    "Experience mismatch",
    "Location",
    "Work authorization",
    "Rate",
    "Client rejection",
    "Candidate declined",
    "Position closed",
    "Duplicate submission",
    "No response",
    "Other",
)

WITHDRAWAL_REASONS = (
    "Candidate accepted another offer",
    "Candidate no longer interested",
    "Compensation",
    "Location",
    "Timing",
    "Work authorization",
    "Personal reason",
    "Other",
)


def normalize_pipeline_stage(raw_status: str | None) -> str:
    if not raw_status or not str(raw_status).strip():
        return "Identified"
    mapped = _STATUS_DISPLAY_MAP.get(str(raw_status).strip())
    if mapped:
        return mapped
    return "Submitted"


def resolve_pipeline_stage(
    raw_status: str | None,
    *,
    has_completed_interview: bool = False,
    has_scheduled_interview: bool = False,
) -> str:
    stage = normalize_pipeline_stage(raw_status)
    raw = (raw_status or "").strip()
    if raw in ("Interview", "Interviewing", "Scheduled") or stage in (
        "Interview Scheduled", "Interview Completed",
    ):
        if has_completed_interview and not has_scheduled_interview:
            return "Interview Completed"
        if has_scheduled_interview:
            return "Interview Scheduled"
        if has_completed_interview:
            return "Interview Completed"
        return "Interview Scheduled"
    return stage


def stage_order(stage: str) -> int:
    return STAGE_ORDER.get(stage, 50)


def matches_stage_group(display_stage: str, group: str) -> bool:
    g = (group or "").strip().lower()
    members = STAGE_GROUPS.get(g)
    if members is None:
        return display_stage.lower().replace(" ", "_") == g or display_stage.lower() == g.replace("_", " ")
    return display_stage in members


def raw_statuses_for_stage(stage: str) -> set[str]:
    wanted = stage.strip()
    if wanted in ("Interview Scheduled", "Interview Completed"):
        return {raw for raw, display in _STATUS_DISPLAY_MAP.items() if display.startswith("Interview")}
    return {raw for raw, display in _STATUS_DISPLAY_MAP.items() if display == wanted}


def raw_statuses_matching_group(group: str) -> tuple[set[str], bool]:
    g = (group or "").strip().lower()
    members = STAGE_GROUPS.get(g)
    if not members:
        for s in PIPELINE_STAGES:
            if s.lower().replace(" ", "_") == g or s.lower() == g.replace("_", " "):
                return raw_statuses_for_stage(s), False
        return set(), False
    known = {raw for raw, display in _STATUS_DISPLAY_MAP.items() if display in members}
    if members & {"Interview Scheduled", "Interview Completed"}:
        known |= {"Interview", "Interviewing", "Scheduled"}
    includes_unmapped = "Submitted" in members
    return known, includes_unmapped


def preferred_raw_status(display_stage: str) -> str:
    return STAGE_TO_RAW.get(display_stage, "Draft")


def is_backward_transition(from_stage: str, to_stage: str) -> bool:
    return stage_order(to_stage) < stage_order(from_stage)


def is_protected_transition(from_stage: str, to_stage: str) -> bool:
    if from_stage == to_stage:
        return False
    if from_stage in TERMINAL_STAGES and to_stage not in TERMINAL_STAGES:
        return True
    if is_backward_transition(from_stage, to_stage) and from_stage in PROTECTED_BACKWARD_FROM:
        return True
    return False


def validate_transition(
    from_stage: str,
    to_stage: str,
    *,
    reason: str | None = None,
    confirmed: bool = False,
) -> str | None:
    """Return error message if invalid; None if allowed."""
    if to_stage not in PIPELINE_STAGES:
        return f"Unknown stage: {to_stage}"
    if from_stage == to_stage:
        return None
    if to_stage in ("Rejected", "Withdrawn"):
        return None
    if from_stage in TERMINAL_STAGES:
        if not confirmed:
            return f"Confirm before moving from {from_stage}."
        if not (reason or "").strip():
            return f"A reason is required when leaving {from_stage}."
        return None
    if is_protected_transition(from_stage, to_stage) and not (reason or "").strip():
        return "A reason is required for this stage change."
    allowed = FORWARD_EDGES.get(from_stage, frozenset())
    if to_stage in allowed:
        return None
    if is_backward_transition(from_stage, to_stage):
        return None
    if stage_order(to_stage) > stage_order(from_stage):
        return None
    return f"Invalid transition from {from_stage} to {to_stage}."
