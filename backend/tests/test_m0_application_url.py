"""Phase 5 M0 — URL classification, detector, fixtures (read-only)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.application_url import (
    normalize_application_url,
    classify_platform,
    prefer_application_url_from_parse,
    PLATFORM_GREENHOUSE,
    PLATFORM_LEVER,
    PLATFORM_WORKDAY,
    PLATFORM_LINKEDIN,
    PLATFORM_COMPANY_CAREERS,
    PLATFORM_RECRUITER_EMAIL,
    PLATFORM_UNKNOWN,
    PLATFORM_GENERIC_FORM,
)
from services.greenhouse_detector import (
    detect_from_html,
    detect_from_greenhouse_api_json,
    detect_fixture_file,
    normalize_field_label,
)

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures" / "greenhouse"


def test_greenhouse_url_patterns():
    samples = [
        "https://boards.greenhouse.io/public/jobs/123",
        "https://job-boards.greenhouse.io/discord/jobs/456",
        "https://boards.greenhouse.io/embed/job_app?for=acme&token=1",
        "http://boards.greenhouse.io/acme/jobs/1?utm_source=li&utm_campaign=x",
        "careers.example.com/jobs/1?gh_jid=99",
    ]
    for u in samples[:4]:
        c = normalize_application_url(u)
        assert c.is_valid
        assert c.platform == PLATFORM_GREENHOUSE
    # gh_jid on non-greenhouse host still counts as greenhouse signal per classifier
    c = normalize_application_url(samples[4])
    assert c.platform == PLATFORM_GREENHOUSE


def test_non_greenhouse_urls():
    assert normalize_application_url("https://jobs.lever.co/acme/abc").platform == PLATFORM_LEVER
    assert normalize_application_url("https://acme.wd1.myworkdayjobs.com/en-US/careers").platform == PLATFORM_WORKDAY
    assert normalize_application_url("https://apply.workable.com/acme/j/ABC").platform == "workable"
    assert normalize_application_url("https://jobs.ashbyhq.com/acme/123").platform == "ashby"


def test_linkedin_urls():
    c = normalize_application_url("https://www.linkedin.com/jobs/view/123")
    assert c.is_valid
    assert c.platform == PLATFORM_LINKEDIN


def test_generic_career_sites():
    c = normalize_application_url("https://careers.google.com/jobs/results/123")
    assert c.platform == PLATFORM_COMPANY_CAREERS
    c2 = normalize_application_url("https://stripe.com/jobs/listing/abc")
    assert c2.platform == PLATFORM_COMPANY_CAREERS


def test_recruiter_contact_only_classification():
    assert classify_platform(None, has_recruiter_email=True, has_application_url=False) == PLATFORM_RECRUITER_EMAIL
    c = normalize_application_url("mailto:recruiter@example.com")
    assert c.platform == PLATFORM_RECRUITER_EMAIL
    assert not c.is_valid


def test_unsafe_schemes():
    for u in ("javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd"):
        c = normalize_application_url(u)
        assert not c.is_valid
        assert "unsafe_scheme" in (c.error or "")


def test_malformed_urls():
    assert not normalize_application_url("not a url").is_valid
    assert not normalize_application_url("http://").is_valid
    assert not normalize_application_url("").is_valid
    assert not normalize_application_url(None).is_valid


def test_url_normalization_and_tracking_removal():
    c = normalize_application_url(
        "HTTPS://WWW.Boards.Greenhouse.IO/acme/jobs/1/?utm_source=x&utm_medium=y&fbclid=1&gh_jid=42"
    )
    assert c.is_valid
    assert c.host == "boards.greenhouse.io"
    assert "utm_source" in (c.tracking_params_removed or [])
    assert "fbclid" in (c.tracking_params_removed or [])
    assert "gh_jid=42" in (c.normalized_url or "")
    assert "utm_source" not in (c.normalized_url or "")
    assert c.normalized_url and not c.normalized_url.endswith("/")


def test_prefer_recovers_greenhouse_from_email_text():
    text = "Please apply here: https://boards.greenhouse.io/acme/jobs/999 thanks"
    c = prefer_application_url_from_parse("", text)
    assert c.platform == PLATFORM_GREENHOUSE
    assert "999" in (c.normalized_url or "")


def test_google_forms_generic():
    assert normalize_application_url("https://docs.google.com/forms/d/e/abc/viewform").platform == PLATFORM_GENERIC_FORM


def test_backfill_idempotency(db_session):
    from models import JobRequirement
    from scripts.m0_backfill_and_report import backfill

    job = JobRequirement(
        job_title="Eng",
        application_url="https://boards.greenhouse.io/acme/jobs/1?utm_source=test",
        status="Open",
        review_status="Approved",
        published_for_matching=True,
    )
    db_session.add(job)
    db_session.commit()

    first = backfill(db_session)
    assert first["updated"] >= 1
    db_session.refresh(job)
    assert job.application_platform == PLATFORM_GREENHOUSE
    assert "utm_source" not in (job.application_url or "")
    second = backfill(db_session)
    assert second["second_pass_changes"] == 0


def test_fixture_html_field_detection():
    path = FIXTURES / "form_acme_software_engineer.html"
    result = detect_fixture_file(path)
    assert result.is_greenhouse
    assert result.filled_any_fields is False
    assert result.submitted is False
    for name in ("first_name", "last_name", "email", "phone", "resume_upload", "linkedin_url"):
        assert name in result.supported_fields
    assert any("work_authorization" == x for x in result.supported_fields)
    assert any("sponsorship_required" == x for x in result.supported_fields)
    assert result.sensitive_fields  # gender voluntary
    assert result.legal_fields or any(f.classification == "legal_attestation" for f in result.fields)
    assert result.upload_controls
    assert result.custom_fields  # why interested / how hear / tech


def test_fixture_required_cover_letter():
    result = detect_fixture_file(FIXTURES / "form_northwind_designer.html")
    assert "cover_letter_upload" in result.supported_fields
    assert any("salary" in (f.field_label or "").lower() and f.classification == "unsupported" for f in result.fields)
    assert any("veteran" in (f.field_label or "").lower() for f in result.fields)


def test_sensitive_question_classification():
    assert normalize_field_label("Gender (Voluntary Self-Identification)", "text")[1] == "sensitive_question"
    assert normalize_field_label("Veteran Status", "select")[1] == "sensitive_question"
    assert normalize_field_label("I certify my answers are true", "checkbox")[1] == "legal_attestation"
    assert normalize_field_label("First Name", "text") == ("first_name", "supported")


def test_greenhouse_api_json_samples():
    samples = list(FIXTURES.glob("sample_*.json"))
    assert len(samples) >= 5
    boards = {json.loads(p.read_text(encoding="utf-8")).get("board") for p in samples}
    assert len(boards) >= 3
    for p in samples[:5]:
        result = detect_from_greenhouse_api_json(json.loads(p.read_text(encoding="utf-8")))
        assert result.is_greenhouse
        assert result.filled_any_fields is False
        assert result.submitted is False
        # Standard Greenhouse boards include name/email/resume questions
        assert result.fields


def test_detector_no_side_effects_on_non_greenhouse():
    html = "<html><body><form><input name='q' /></form></body></html>"
    result = detect_from_html(html, application_url="https://careers.example.com/x")
    assert result.is_greenhouse is False
    assert result.filled_any_fields is False
    assert result.submitted is False


def test_pipeline_persists_platform(client, db_session, guest_headers):
    """Published job with Greenhouse URL surfaces platform on public detail."""
    from models import JobRequirement
    from services.application_url import normalize_application_url

    url = "https://boards.greenhouse.io/acme/jobs/42?utm_source=email"
    classified = normalize_application_url(url)
    job = JobRequirement(
        job_title="Backend Engineer",
        application_url=classified.normalized_url,
        application_platform=classified.platform,
        status="Open",
        review_status="Approved",
        published_for_matching=True,
        client="Acme",
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    detail = client.get(f"/api/integrations/joblens/jobs/{job.id}", headers=guest_headers)
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["application_url"]
    assert "utm_source" not in body["application_url"]
    assert body.get("application_platform") == PLATFORM_GREENHOUSE

    saved = client.post(
        "/api/jobs/from-external",
        headers=guest_headers,
        json={"job_requirement_id": job.id, "status": "Saved"},
    )
    assert saved.status_code in (200, 201)
    assert saved.json()["job_url"]
    snap = json.loads(saved.json()["job_snapshot_json"])
    assert snap.get("application_url")
    assert snap.get("application_platform") == PLATFORM_GREENHOUSE
