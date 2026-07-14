"""Unit tests for services/pipeline_status.py."""

from services.pipeline_status import (
    normalize_pipeline_stage,
    resolve_pipeline_stage,
    validate_transition,
)


def test_normalize_pipeline_stage_mappings():
    assert normalize_pipeline_stage("New") == "Identified"
    assert normalize_pipeline_stage("Draft") == "Identified"
    assert normalize_pipeline_stage("Identified") == "Identified"
    assert normalize_pipeline_stage("Employee Contacted") == "Contacted"
    assert normalize_pipeline_stage("Contacted") == "Contacted"
    assert normalize_pipeline_stage("Interested") == "Interested"
    assert normalize_pipeline_stage("Qualified") == "Interested"
    assert normalize_pipeline_stage("Employee Interested") == "Interested"
    assert normalize_pipeline_stage("Submitted") == "Submitted"
    assert normalize_pipeline_stage("Sent") == "Submitted"
    assert normalize_pipeline_stage("Client Review") == "Client Review"
    assert normalize_pipeline_stage("Under Review") == "Client Review"
    assert normalize_pipeline_stage("Interview") == "Interview Scheduled"
    assert normalize_pipeline_stage("Interviewing") == "Interview Scheduled"
    assert normalize_pipeline_stage("Offer") == "Offer"
    assert normalize_pipeline_stage("Offer Extended") == "Offer"
    assert normalize_pipeline_stage("Selected") == "Placed"
    assert normalize_pipeline_stage("Hired") == "Placed"
    assert normalize_pipeline_stage("Rejected") == "Rejected"
    assert normalize_pipeline_stage("Declined") == "Rejected"
    assert normalize_pipeline_stage("Withdrawn") == "Withdrawn"
    assert normalize_pipeline_stage(None) == "Identified"
    assert normalize_pipeline_stage("") == "Identified"
    assert normalize_pipeline_stage("SomeUnknownStatus") == "Submitted"


def test_resolve_interview_completed_vs_scheduled():
    assert (
        resolve_pipeline_stage(
            "Interview",
            has_completed_interview=True,
            has_scheduled_interview=False,
        )
        == "Interview Completed"
    )
    assert (
        resolve_pipeline_stage(
            "Interview",
            has_completed_interview=False,
            has_scheduled_interview=True,
        )
        == "Interview Scheduled"
    )
    assert (
        resolve_pipeline_stage(
            "Interview",
            has_completed_interview=True,
            has_scheduled_interview=True,
        )
        == "Interview Scheduled"
    )


def test_validate_transition_forward_ok():
    assert validate_transition("Identified", "Contacted") is None
    assert validate_transition("Contacted", "Interested") is None
    assert validate_transition("Submitted", "Client Review") is None
    assert validate_transition("Offer", "Placed") is None


def test_validate_transition_reject_withdraw_always_allowed():
    assert validate_transition("Identified", "Rejected") is None
    assert validate_transition("Offer", "Withdrawn") is None


def test_validate_transition_protected_backward_requires_reason():
    err = validate_transition("Submitted", "Interested")
    assert err is not None
    assert "reason" in err.lower()
    assert validate_transition("Submitted", "Interested", reason="Mistake") is None


def test_validate_transition_terminal_requires_confirm_and_reason():
    err = validate_transition("Placed", "Offer")
    assert err is not None
    err2 = validate_transition("Placed", "Offer", confirmed=True)
    assert err2 is not None
    assert validate_transition("Placed", "Offer", confirmed=True, reason="Undo") is None


def test_validate_transition_same_stage_ok():
    assert validate_transition("Submitted", "Submitted") is None
