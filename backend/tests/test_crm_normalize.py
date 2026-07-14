"""Unit tests for CRM type/status/source/email/phone/domain normalization."""

from services.crm_normalize import (
    contact_display_name,
    normalize_company_name,
    normalize_company_status,
    normalize_company_type,
    normalize_contact_status,
    normalize_contact_type,
    normalize_domain,
    normalize_email,
    normalize_phone,
    normalize_source_label,
    raw_company_types_matching_display,
    raw_contact_statuses_matching_display,
    raw_contact_types_matching_display,
)


def test_contact_type_maps():
    assert normalize_contact_type("Recruiter") == "Recruiter"
    assert normalize_contact_type("Client Manager") == "Client Contact"
    assert normalize_contact_type("Vendor Manager") == "Vendor Contact"
    assert normalize_contact_type("HR Contact") == "Other"
    assert normalize_contact_type(None) == "Other"
    assert normalize_contact_type("WeirdFuture") == "Other"


def test_company_type_maps():
    assert normalize_company_type("Staffing Vendor") == "Vendor"
    assert normalize_company_type("Direct Client") == "Client"
    assert normalize_company_type("Implementation Partner") == "Partner"
    assert normalize_company_type(None) == "Other"


def test_status_maps():
    assert normalize_contact_status("Do Not Contact") == "Inactive"
    assert normalize_contact_status("Bounced Email") == "Inactive"
    assert normalize_contact_status("Prospect") == "Active"
    assert normalize_company_status("Blocked") == "Inactive"
    assert normalize_company_status("Do Not Work With") == "Inactive"
    assert normalize_company_status(None) == "Active"


def test_source_label_maps():
    assert normalize_source_label("Zoho Mail Sync") == "Zoho Email"
    assert normalize_source_label("Job Import") == "Job Import"
    assert normalize_source_label("Manual Entry") == "Manual Entry"
    assert normalize_source_label("API webhook") == "API Import"
    assert normalize_source_label("candidate referral") == "Candidate Referral"
    assert normalize_source_label(None) == "Other"


def test_email_phone_domain_name():
    assert normalize_email("  Pat@Example.COM ") == "pat@example.com"
    assert normalize_phone("(555) 999-8888") == "5559998888"
    assert normalize_domain("https://www.AcmeCorp.com/about") == "acmecorp.com"
    assert normalize_company_name("Acme, Corp!") == "acme corp"
    assert contact_display_name("Pat", "Lee", None) == "Pat Lee"
    assert contact_display_name(None, None, "a@b.com") == "a@b.com"
    assert contact_display_name(None, None, None) == "Unknown"


def test_raw_type_matching_display():
    raws = raw_contact_types_matching_display("Client Contact")
    assert "Client Contact" in raws
    assert "Client Manager" in raws
    assert "Account Manager" in raws
    company = raw_company_types_matching_display("Vendor")
    assert "Staffing Vendor" in company
    assert "Vendor" in company
    statuses = raw_contact_statuses_matching_display("Inactive")
    assert "Do Not Contact" in statuses
    assert "Inactive" in statuses
