"""Pure unit tests for job status/source normalization (services/job_status.py)."""

from services.job_status import (
    is_open_status_group,
    is_zoho_source,
    matches_status_group,
    normalize_job_status,
    normalize_source_label,
    raw_statuses_matching_group,
)


def test_normalize_job_status_covers_all_legacy_values():
    assert normalize_job_status("New") == "Draft"
    assert normalize_job_status("Needs Review") == "Draft"
    assert normalize_job_status("Parsed") == "Draft"
    assert normalize_job_status("Open") == "Open"
    assert normalize_job_status("Ready for Match") == "Open"
    assert normalize_job_status("Matched") == "Open"
    assert normalize_job_status("Sent to Employee") == "Open"
    assert normalize_job_status("Employee Interested") == "Open"
    assert normalize_job_status("Submitted") == "Open"
    assert normalize_job_status("Interview") == "Open"
    assert normalize_job_status("On Hold") == "On Hold"
    assert normalize_job_status("Selected") == "Filled"
    assert normalize_job_status("Closed") == "Closed"
    assert normalize_job_status("Rejected") == "Closed"
    assert normalize_job_status("Duplicate") == "Closed"
    assert normalize_job_status("Spam") == "Closed"
    assert normalize_job_status(None) == "Draft"
    assert normalize_job_status("") == "Draft"
    assert normalize_job_status("SomeFutureStatus") == "Open"


def test_open_status_group_excludes_draft_closed_filled():
    assert is_open_status_group("Open") is True
    assert is_open_status_group("On Hold") is True
    assert is_open_status_group("New") is False  # Draft
    assert is_open_status_group("Closed") is False
    assert is_open_status_group("Selected") is False  # Filled


def test_matches_status_group_exact_canonical():
    assert matches_status_group("Selected", "Filled") is True
    assert matches_status_group("New", "Draft") is True
    assert matches_status_group("On Hold", "On Hold") is True
    assert matches_status_group("Open", "Filled") is False


def test_raw_statuses_matching_group_agrees_with_matches_status_group():
    for group in ("open", "Draft", "On Hold", "Filled", "Closed"):
        known, includes_unmapped = raw_statuses_matching_group(group)
        for raw in known:
            assert matches_status_group(raw, group) is True
        if not includes_unmapped:
            assert matches_status_group("TotallyUnknownStatus", group) is False
        else:
            assert matches_status_group("TotallyUnknownStatus", group) is True


def test_normalize_source_label():
    assert normalize_source_label("Zoho Mail") == "Zoho Email"
    assert normalize_source_label("Manual") == "Manual Entry"
    assert normalize_source_label("Email Copy/Paste") == "Manual Entry"
    assert normalize_source_label("Greenhouse API") == "API Import"
    assert normalize_source_label("Something Else") == "Other"
    assert normalize_source_label(None) == "Other"
    assert normalize_source_label("") == "Other"


def test_is_zoho_source():
    assert is_zoho_source("Zoho Mail") is True
    assert is_zoho_source("Manual") is False
    assert is_zoho_source(None) is False
