"""Pure unit tests for candidate status normalization."""

from services.candidate_status import (
    is_active_status_group,
    matches_status_group,
    normalize_candidate_status,
    normalize_email,
    normalize_phone,
    raw_statuses_matching_group,
)


def test_normalize_candidate_status_legacy_and_canonical():
    assert normalize_candidate_status("New") == "New"
    assert normalize_candidate_status("Active") == "Active"
    assert normalize_candidate_status("Bench") == "Active"
    assert normalize_candidate_status("On Project") == "Active"
    assert normalize_candidate_status("Available Soon") == "Active"
    assert normalize_candidate_status("Submitted") == "Submitted"
    assert normalize_candidate_status("Interviewing") == "Interviewing"
    assert normalize_candidate_status("Interview") == "Interviewing"
    assert normalize_candidate_status("Offered") == "Offered"
    assert normalize_candidate_status("Placed") == "Placed"
    assert normalize_candidate_status("Selected") == "Placed"
    assert normalize_candidate_status("Rejected") == "Rejected"
    assert normalize_candidate_status("Inactive") == "Inactive"
    assert normalize_candidate_status("Do Not Contact") == "Inactive"
    assert normalize_candidate_status("Former Employee") == "Inactive"
    assert normalize_candidate_status(None) == "Active"
    assert normalize_candidate_status("") == "Active"
    assert normalize_candidate_status("SomeFutureStatus") == "Active"


def test_active_status_group():
    assert is_active_status_group("Active") is True
    assert is_active_status_group("Bench") is True
    assert is_active_status_group("New") is True
    assert is_active_status_group("Submitted") is True
    assert is_active_status_group("Inactive") is False
    assert is_active_status_group("Placed") is False
    assert is_active_status_group("Rejected") is False


def test_matches_status_group():
    assert matches_status_group("Bench", "Active") is True
    assert matches_status_group("Bench", "active") is True
    assert matches_status_group("Inactive", "Inactive") is True
    assert matches_status_group("Former Employee", "inactive_group") is True
    assert matches_status_group("Active", "Inactive") is False


def test_raw_statuses_matching_group_agrees():
    for group in ("active", "New", "Active", "Inactive", "inactive_group", "Placed"):
        known, includes_unmapped = raw_statuses_matching_group(group)
        for raw in known:
            assert matches_status_group(raw, group) is True
        if includes_unmapped:
            assert matches_status_group("TotallyUnknown", group) is True
        else:
            assert matches_status_group("TotallyUnknown", group) is False


def test_normalize_email_phone():
    assert normalize_email("  Pat@Example.COM ") == "pat@example.com"
    assert normalize_phone("+1 (555) 123-4567") == "15551234567"
    assert normalize_phone(None) == ""
    assert normalize_email(None) == ""
