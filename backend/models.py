from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime


# --- SQLAlchemy ORM models ---

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    name = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())


class JobApplication(Base):
    __tablename__ = "job_applications"

    id = Column(Integer, primary_key=True, index=True)
    company = Column(String(255), nullable=False)
    role = Column(String(255), nullable=False)
    status = Column(String(50), default="Applied")
    date_applied = Column(DateTime, default=func.now())
    job_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    salary_range = Column(String(100), nullable=True)
    location = Column(String(255), nullable=True)
    work_type = Column(String(50), nullable=True)
    recruiter_contact = Column(String(255), nullable=True)
    recruiter_name = Column(String(255), nullable=True)
    recruiter_email = Column(String(255), nullable=True)
    follow_up_date = Column(DateTime, nullable=True)
    reminder_type = Column(String(50), nullable=True)
    # Set when this tracker entry was created from a published CRM/ATS job
    # (Discover Jobs → Save Job / Add to Tracker / Contact Recruiter) rather
    # than added manually. Lets the Job Tracker link back to the full job
    # detail page; absence of a link (source job unpublished/removed) never
    # affects this row, which already carries its own copy of the key fields.
    source_job_requirement_id = Column(Integer, nullable=True, index=True)
    # Full job detail captured at save time (same shape as the public
    # JobRequirementResponse projection) — lets a user who already saved or
    # tracked this job keep viewing its description, skills, recruiter info,
    # rate, and location after the source job is closed or unpublished. The
    # Job Details page falls back to this instead of the live ATS record.
    job_snapshot_json = Column(Text, nullable=True)
    # Apply Options workflow (see routers/jobs.py's from-external /
    # mark-applied endpoints). `application_method` is one of
    # employer_website | recruiter_email | manual.
    application_source = Column(String(50), nullable=True)
    application_method = Column(String(30), nullable=True)
    application_opened_at = Column(DateTime, nullable=True)
    applied_at = Column(DateTime, nullable=True)
    recruiter_contacted_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, nullable=True)
    # Phase 4 — Application Status history / action indicators
    archived_at = Column(DateTime, nullable=True)
    status_changed_at = Column(DateTime, nullable=True)
    status_changed_by = Column(String(50), nullable=True)  # user | system | auto
    action_required = Column(Boolean, nullable=True, default=False)
    action_required_reason = Column(String(255), nullable=True)
    last_user_activity_at = Column(DateTime, nullable=True)
    # Reminder completion (inline reminder model — no separate reminders table)
    reminder_completed_at = Column(DateTime, nullable=True)
    # Phase 5 M3 — user-confirmed submission metadata (no silent apply)
    confirmation_number = Column(String(120), nullable=True)
    confirmation_url = Column(String(500), nullable=True)
    submission_notes = Column(Text, nullable=True)
    resume_document_id = Column(Integer, nullable=True)
    cover_letter_document_id = Column(Integer, nullable=True)
    guest_id = Column(String(36), nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class ApplicationNote(Base):
    """User-authored notes on a JobApplication (Application Status detail)."""

    __tablename__ = "application_notes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(36), nullable=True, index=True)
    job_application_id = Column(Integer, ForeignKey("job_applications.id"), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class ResumeAnalysis(Base):
    __tablename__ = "resume_analyses"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255))
    resume_text = Column(Text, nullable=True)
    ats_score = Column(Float)
    analysis_json = Column(Text)
    guest_id = Column(String(36), nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=func.now())


class JobMatch(Base):
    __tablename__ = "job_matches"

    id = Column(Integer, primary_key=True, index=True)
    resume_text = Column(Text)
    job_description = Column(Text)
    company_name = Column(String(255), nullable=True)
    match_json = Column(Text)
    # Set when the match was run against a job selected from the internal ATS
    # (routers/public_jobs.py) rather than pasted manually. `job_snapshot_json`
    # is a point-in-time copy of the job + recruiter fields at analysis time —
    # historical results must not change if the source job is later edited,
    # closed, or removed, so this is never re-joined against JobRequirement.
    job_requirement_id = Column(Integer, nullable=True, index=True)
    job_snapshot_json = Column(Text, nullable=True)
    guest_id = Column(String(36), nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=func.now())


class CoverLetter(Base):
    __tablename__ = "cover_letters"

    id = Column(Integer, primary_key=True, index=True)
    resume_text = Column(Text)
    job_description = Column(Text)
    company_name = Column(String(255), nullable=True)
    tone = Column(String(50), nullable=True)
    content = Column(Text)
    guest_id = Column(String(36), nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=func.now())


class AiActivity(Base):
    __tablename__ = "ai_activities"

    id = Column(Integer, primary_key=True, index=True)
    activity_type = Column(String(50), nullable=False)
    summary = Column(String(500), nullable=False)
    detail = Column(String(500), nullable=True)
    guest_id = Column(String(36), nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=func.now())

class Profile(Base):
    """JobLens job-seeker profile — extended for Phase 3 completeness / readiness.

    Identity email stays on `users.email` (auth-managed) and is not editable here.
    Flexible sections use JSON Text columns.
    """

    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, unique=True, index=True)
    full_name = Column(String(255), nullable=True)
    preferred_name = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    address_line_1 = Column(String(255), nullable=True)
    address_line_2 = Column(String(255), nullable=True)
    city = Column(String(120), nullable=True)
    state = Column(String(120), nullable=True)
    postal_code = Column(String(30), nullable=True)
    country = Column(String(120), nullable=True)
    location = Column(String(255), nullable=True)
    current_location = Column(String(255), nullable=True)
    headline = Column(String(255), nullable=True)
    bio = Column(Text, nullable=True)
    skills = Column(Text, nullable=True)
    experience = Column(Text, nullable=True)
    education = Column(Text, nullable=True)
    projects_json = Column(Text, nullable=True)
    certifications_json = Column(Text, nullable=True)
    linkedin_url = Column(String(500), nullable=True)
    portfolio_url = Column(String(500), nullable=True)
    professional_links_json = Column(Text, nullable=True)
    work_authorization_json = Column(Text, nullable=True)
    job_preferences_json = Column(Text, nullable=True)
    default_resume_id = Column(Integer, nullable=True)
    default_cover_letter_id = Column(Integer, nullable=True)
    profile_completion_percentage = Column(Integer, nullable=True, default=0)
    profile_completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class ApplicationAnswer(Base):
    """Reusable, user-approved answers for common job-application questions."""

    __tablename__ = "application_answers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    normalized_question_key = Column(String(100), nullable=False, index=True)
    display_question = Column(String(500), nullable=False)
    answer = Column(Text, nullable=False)
    answer_type = Column(String(50), nullable=False, default="text")
    is_sensitive = Column(Boolean, nullable=False, default=False)
    approval_status = Column(String(30), nullable=False, default="draft")
    reuse_policy = Column(String(40), nullable=False, default="always_ask")
    last_reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class ExtensionAuthChallenge(Base):
    """One-time pairing challenge for browser-extension ↔ JobLens connect (M1)."""

    __tablename__ = "extension_auth_challenges"

    id = Column(Integer, primary_key=True, index=True)
    challenge = Column(String(64), unique=True, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="pending")  # pending|confirmed|consumed|expired
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(36), nullable=True, index=True)
    extension_version = Column(String(30), nullable=True)
    # One-time plaintext delivered via exchange then cleared
    pending_access_token = Column(Text, nullable=True)
    pending_refresh_token = Column(Text, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    confirmed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())


class ExtensionToken(Base):
    """Revocable extension-scoped credential (hash only at rest)."""

    __tablename__ = "extension_tokens"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(36), nullable=True, index=True)
    access_token_hash = Column(String(64), nullable=False)
    refresh_token_hash = Column(String(64), nullable=False, index=True)
    extension_version = Column(String(30), nullable=True)
    expires_at = Column(DateTime, nullable=False)
    refresh_expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())


class ExtensionDiagnostic(Base):
    """Read-only Greenhouse form diagnostic saved from the extension (no field values)."""

    __tablename__ = "extension_diagnostics"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(36), nullable=True, index=True)
    job_id = Column(Integer, nullable=True, index=True)
    application_url_normalized = Column(String(500), nullable=True)
    platform = Column(String(50), nullable=True)
    employer = Column(String(255), nullable=True)
    job_title = Column(String(255), nullable=True)
    detected_fields_json = Column(Text, nullable=False, default="[]")
    supported_count = Column(Integer, nullable=False, default=0)
    sensitive_count = Column(Integer, nullable=False, default=0)
    unsupported_count = Column(Integer, nullable=False, default=0)
    detector_version = Column(String(40), nullable=True)
    extension_version = Column(String(30), nullable=True)
    created_at = Column(DateTime, default=func.now())


class ExtensionFillSession(Base):
    """M2 assisted-fill session — field names/status metadata only (no profile values)."""

    __tablename__ = "extension_fill_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(36), nullable=True, index=True)
    job_id = Column(Integer, nullable=True, index=True)  # JobApplication.id when known
    job_requirement_id = Column(Integer, nullable=True, index=True)
    application_url_normalized = Column(String(500), nullable=True)
    platform = Column(String(50), nullable=True, default="greenhouse")
    status = Column(String(40), nullable=False, default="created", index=True)
    detected_fields_json = Column(Text, nullable=False, default="[]")
    requested_fields_json = Column(Text, nullable=False, default="[]")
    approved_fields_json = Column(Text, nullable=False, default="[]")
    successful_fields_json = Column(Text, nullable=False, default="[]")
    skipped_fields_json = Column(Text, nullable=False, default="[]")
    failed_fields_json = Column(Text, nullable=False, default="[]")
    missing_fields_json = Column(Text, nullable=False, default="[]")
    detector_version = Column(String(40), nullable=True)
    extension_version = Column(String(30), nullable=True)
    started_at = Column(DateTime, default=func.now())
    reviewed_at = Column(DateTime, nullable=True)
    filled_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class SeekerDocument(Base):
    """Immutable-ish binary document for JobLens seeker application uploads (M3).

    Created when a resume file is analyzed (original bytes retained) or when a
    cover letter is snapshotted as text/plain for employer upload.
    """

    __tablename__ = "seeker_documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(36), nullable=True, index=True)
    document_type = Column(String(40), nullable=False, index=True)  # resume | cover_letter
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(120), nullable=False)
    file_size = Column(Integer, nullable=False, default=0)
    version_number = Column(Integer, nullable=False, default=1)
    storage_path = Column(String(500), nullable=False)
    source_resume_analysis_id = Column(Integer, nullable=True, index=True)
    source_cover_letter_id = Column(Integer, nullable=True, index=True)
    content_sha256 = Column(String(64), nullable=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class ApplicationDocument(Base):
    """Links a JobApplication to the exact document version used (M3)."""

    __tablename__ = "application_documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(36), nullable=True, index=True)
    job_application_id = Column(Integer, ForeignKey("job_applications.id"), nullable=False, index=True)
    extension_fill_session_id = Column(Integer, nullable=True, index=True)
    document_type = Column(String(40), nullable=False)  # resume | cover_letter | supporting_document
    source_document_id = Column(Integer, nullable=False, index=True)
    source_document_version = Column(Integer, nullable=False, default=1)
    file_name = Column(String(255), nullable=False)
    mime_type = Column(String(120), nullable=True)
    file_size = Column(Integer, nullable=True)
    upload_method = Column(String(40), nullable=False, default="extension_assisted")
    upload_status = Column(String(40), nullable=False, default="selected")
    employer_field_label = Column(String(255), nullable=True)
    uploaded_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class ExtensionUploadSession(Base):
    """One-time, short-lived authorization to retrieve a document for upload assist."""

    __tablename__ = "extension_upload_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    guest_id = Column(String(36), nullable=True, index=True)
    fill_session_id = Column(Integer, nullable=True, index=True)
    job_application_id = Column(Integer, nullable=True, index=True)
    seeker_document_id = Column(Integer, nullable=False, index=True)
    document_type = Column(String(40), nullable=False)
    employer_field_key = Column(String(255), nullable=True)
    employer_field_label = Column(String(255), nullable=True)
    accept_attr = Column(String(255), nullable=True)
    retrieval_token_hash = Column(String(64), nullable=False, index=True)
    status = Column(String(40), nullable=False, default="approved")  # approved|retrieving|used|cancelled|expired|failed
    used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    verification_status = Column(String(40), nullable=True)
    error_code = Column(String(80), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class Employee(Base):
    """ATS employee/consultant record — private admin data, never exposed via
    public (guest_id-based) routes. Endpoints are gated by verified Clerk
    sessions via require_writer/require_admin in backend/ats_auth.py."""

    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    # `name` is retained for backward compatibility with the existing employee
    # list/form/detail UI. New granular name fields are additive and optional.
    name = Column(String(255), nullable=False)
    employee_code = Column(String(50), nullable=True, index=True)
    first_name = Column(String(255), nullable=True)
    middle_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    preferred_name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=False, index=True)
    personal_email = Column(String(255), nullable=True)
    company_email = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    alternate_phone = Column(String(50), nullable=True)
    address_line_1 = Column(String(255), nullable=True)
    address_line_2 = Column(String(255), nullable=True)
    city = Column(String(120), nullable=True)
    state = Column(String(120), nullable=True)
    postal_code = Column(String(30), nullable=True)
    country = Column(String(120), nullable=True)
    location = Column(String(255), nullable=True)
    current_location = Column(String(255), nullable=True)
    willing_to_relocate = Column(Boolean, nullable=True)
    preferred_locations = Column(Text, nullable=True)
    work_authorization = Column(String(120), nullable=True)
    visa_status = Column(String(50), nullable=True)
    visa_expiration_date = Column(String(30), nullable=True)
    sponsorship_required = Column(Boolean, nullable=True)
    employment_type = Column(String(60), nullable=True)
    current_employer = Column(String(255), nullable=True)
    current_job_title = Column(String(255), nullable=True)
    primary_skill = Column(String(255), nullable=True)
    secondary_skills = Column(Text, nullable=True)
    total_experience = Column(String(50), nullable=True)
    relevant_experience_years = Column(String(50), nullable=True)
    availability = Column(String(50), nullable=True)
    available_from = Column(String(30), nullable=True)
    current_rate = Column(String(100), nullable=True)
    expected_rate = Column(String(100), nullable=True)
    rate_type = Column(String(50), nullable=True)
    remote_preference = Column(String(60), nullable=True)
    status = Column(String(50), default="Active")
    source = Column(String(120), nullable=True)
    linkedin_url = Column(String(500), nullable=True)
    portfolio_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    resumes = relationship("EmployeeResume", back_populates="employee", cascade="all, delete-orphan")


class EmployeeResume(Base):
    """One employee can have many resumes; each belongs to exactly one employee."""

    __tablename__ = "employee_resumes"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=True)
    file_type = Column(String(20), nullable=False)
    file_size = Column(Integer, nullable=False)
    # `file_path` retained for backward compat; `storage_provider`/`storage_path`
    # are the production storage abstraction (local | supabase | s3 | r2 | workdrive).
    file_path = Column(String(500), nullable=False)
    storage_provider = Column(String(50), nullable=True, default="local")
    storage_path = Column(String(500), nullable=True)
    resume_text = Column(Text, nullable=True)
    parsed_name = Column(String(255), nullable=True)
    parsed_email = Column(String(255), nullable=True)
    parsed_phone = Column(String(50), nullable=True)
    parsed_skills = Column(Text, nullable=True)              # JSON-encoded list[str]
    parsed_primary_skill = Column(String(255), nullable=True)
    parsed_total_experience = Column(String(50), nullable=True)
    parsed_job_titles = Column(Text, nullable=True)           # JSON-encoded list[str]
    parsed_clients = Column(Text, nullable=True)              # JSON-encoded list[str]
    parsed_industries = Column(Text, nullable=True)           # JSON-encoded list[str]
    parsed_certifications = Column(Text, nullable=True)       # JSON-encoded list[str]
    parsed_education = Column(Text, nullable=True)            # JSON-encoded list[str]
    parsed_summary = Column(Text, nullable=True)
    # Full structured parse (spec section 5) kept as JSON for fields without a
    # dedicated column (first/last name, current job title, linkedin, etc.).
    parsed_data = Column(Text, nullable=True)
    # "parsed" | "failed" | "pending" — lets the UI offer Retry Parsing without
    # losing the uploaded file when the AI parser errors out.
    parsing_status = Column(String(20), nullable=True, default="parsed")
    is_primary = Column(Boolean, default=True)
    version_number = Column(Integer, nullable=True, default=1)
    uploaded_by = Column(String(255), nullable=True)
    uploaded_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="resumes")


class JobRequirement(Base):
    """Private ATS job requirement — created manually (paste an email/JD) or via
    Zoho Mail parsing, matched to employees via services/job_employee_match.py.
    Endpoints are gated by verified Clerk sessions via require_writer/require_admin
    in backend/ats_auth.py."""

    __tablename__ = "job_requirements"

    id = Column(Integer, primary_key=True, index=True)
    external_job_id = Column(String(100), nullable=True, index=True)
    job_reference_number = Column(String(100), nullable=True)
    job_title = Column(String(255), nullable=False)
    # String names retained for quick entry; FK ids link to CRM when resolved.
    vendor = Column(String(255), nullable=True)
    vendor_id = Column(Integer, ForeignKey("crm_organizations.id"), nullable=True, index=True)
    recruiter_name = Column(String(255), nullable=True)
    recruiter_email = Column(String(255), nullable=True)
    recruiter_phone = Column(String(50), nullable=True)
    recruiter_contact_id = Column(Integer, ForeignKey("crm_contacts.id"), nullable=True, index=True)
    client = Column(String(255), nullable=True)
    client_id = Column(Integer, ForeignKey("crm_organizations.id"), nullable=True, index=True)
    end_client = Column(String(255), nullable=True)
    end_client_id = Column(Integer, ForeignKey("crm_organizations.id"), nullable=True, index=True)
    location = Column(String(255), nullable=True)
    city = Column(String(120), nullable=True)
    state = Column(String(120), nullable=True)
    country = Column(String(120), nullable=True)
    work_type = Column(String(50), nullable=True)
    employment_type = Column(String(60), nullable=True)
    contract_type = Column(String(60), nullable=True)
    rate = Column(String(100), nullable=True)  # legacy display string, e.g. "$75/hr"
    rate_min = Column(String(50), nullable=True)
    rate_max = Column(String(50), nullable=True)
    rate_currency = Column(String(10), nullable=True, default="USD")
    rate_type = Column(String(50), nullable=True)
    duration = Column(String(100), nullable=True)
    visa_requirement = Column(String(255), nullable=True)
    clearance_requirement = Column(String(255), nullable=True)
    required_skills = Column(Text, nullable=True)    # JSON-encoded list[str]
    preferred_skills = Column(Text, nullable=True)   # JSON-encoded list[str]
    minimum_experience = Column(String(50), nullable=True)
    education_requirement = Column(Text, nullable=True)
    certification_requirement = Column(Text, nullable=True)
    job_description = Column(Text, nullable=True)
    # Direct employer application link, when the recruiter/email provided one
    # — powers "Apply on Employer Website" in JobLens's Apply Options modal.
    application_url = Column(String(500), nullable=True)
    # Phase 5 M0 — normalized classifier label (greenhouse, lever, …).
    application_platform = Column(String(50), nullable=True, index=True)
    raw_email_text = Column(Text, nullable=True)
    submission_instructions = Column(Text, nullable=True)
    submission_deadline = Column(String(50), nullable=True)
    number_of_openings = Column(Integer, nullable=True)
    status = Column(String(50), default="New")
    priority = Column(String(20), default="Medium")
    # Editorial gate, independent of the operational `status` pipeline above:
    # has staff explicitly reviewed and approved this requisition for outside
    # visibility? Distinct from `published_for_matching` (the recruiter's
    # publish toggle) — both must hold, alongside an open `status`, for a job
    # to appear in the public Job Matcher (see routers/public_jobs.py).
    review_status = Column(String(20), default="Draft")  # Draft | Approved | Rejected
    # Explicit recruiter opt-in to surface this requisition to public JobLens
    # job-seeker accounts in the Job Matcher (see routers/public_jobs.py).
    # Independent of `status` — a job can be "Ready for Match" internally
    # without ever being published, and closing it (status change) hides it
    # from candidates automatically without needing a second toggle.
    published_for_matching = Column(Boolean, default=False)
    source = Column(String(50), default="Manual")
    notes = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    received_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    # Explicit foreign_keys are required because three columns point at the same
    # crm_organizations table. These resolve the linked CRM records for display.
    vendor_org = relationship("CRMOrganization", foreign_keys=[vendor_id], viewonly=True)
    client_org = relationship("CRMOrganization", foreign_keys=[client_id], viewonly=True)
    end_client_org = relationship("CRMOrganization", foreign_keys=[end_client_id], viewonly=True)
    recruiter_contact = relationship("CRMContact", foreign_keys=[recruiter_contact_id], viewonly=True)


# Statuses that hide a job requirement from the public Job Matcher even if
# `published_for_matching` is still True — see routers/public_jobs.py.
PUBLIC_CLOSED_JOB_STATUSES = {"Closed", "Rejected", "Duplicate", "Spam", "On Hold"}

# Editorial review gate for JobRequirement.review_status (see the field's
# docstring). Only "Approved" jobs are eligible for public matching.
JOB_REVIEW_STATUSES = ("Draft", "Approved", "Rejected")


class CRMOrganization(Base):
    """A vendor, client, end client, or partner in the staffing CRM."""

    __tablename__ = "crm_organizations"

    id = Column(Integer, primary_key=True, index=True)
    organization_name = Column(String(255), nullable=False, index=True)
    organization_type = Column(String(60), nullable=False, default="Staffing Vendor")
    website = Column(String(500), nullable=True)
    email_domain = Column(String(255), nullable=True, index=True)
    industry = Column(String(255), nullable=True)
    address = Column(String(500), nullable=True)
    city = Column(String(120), nullable=True)
    state = Column(String(120), nullable=True)
    country = Column(String(120), nullable=True)
    phone = Column(String(50), nullable=True)
    status = Column(String(50), default="Active")
    preferred_vendor_status = Column(String(60), nullable=True)
    payment_terms = Column(String(120), nullable=True)
    contract_status = Column(String(60), nullable=True)
    msa_status = Column(String(60), nullable=True)
    needs_review = Column(Boolean, default=False)
    source = Column(String(60), nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    contacts = relationship("CRMContact", back_populates="organization", cascade="all, delete-orphan")


class CRMContact(Base):
    """A recruiter or other person tied to a CRM organization."""

    __tablename__ = "crm_contacts"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("crm_organizations.id"), nullable=True, index=True)
    first_name = Column(String(255), nullable=True)
    last_name = Column(String(255), nullable=True)
    job_title = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    # Normalized (lowercased/trimmed) email used to prevent duplicate contacts.
    normalized_email = Column(String(255), nullable=True, unique=True, index=True)
    phone = Column(String(50), nullable=True)
    mobile = Column(String(50), nullable=True)
    contact_type = Column(String(60), default="Recruiter")
    status = Column(String(50), default="Active")
    linkedin_url = Column(String(500), nullable=True)
    preferred_contact_method = Column(String(60), nullable=True)
    needs_review = Column(Boolean, default=False)
    source = Column(String(60), nullable=True)
    last_contacted_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    organization = relationship("CRMOrganization", back_populates="contacts")


class ZohoOAuthState(Base):
    """Short-lived OAuth state for CSRF protection during Zoho connect."""

    __tablename__ = "zoho_oauth_states"

    state = Column(String(64), primary_key=True)
    user_id = Column(String(255), nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)


class ZohoConnection(Base):
    """Encrypted Zoho Mail OAuth connection for one ATS user."""

    __tablename__ = "zoho_connections"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(255), nullable=False, unique=True, index=True)
    zoho_account_id = Column(String(64), nullable=True)
    mailbox_email = Column(String(255), nullable=True)
    encrypted_refresh_token = Column(Text, nullable=True)
    access_token = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    api_domain = Column(String(255), nullable=True)
    inbox_folder_id = Column(String(64), nullable=True)
    scopes = Column(Text, nullable=True)
    status = Column(String(50), default="Active")
    last_sync_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    imported_emails = relationship("ImportedEmail", back_populates="connection", cascade="all, delete-orphan")


class ImportedEmail(Base):
    """Recruiter email imported from Zoho Mail."""

    __tablename__ = "imported_emails"

    id = Column(Integer, primary_key=True, index=True)
    zoho_connection_id = Column(Integer, ForeignKey("zoho_connections.id"), nullable=False, index=True)
    zoho_message_id = Column(String(64), nullable=False, index=True)
    folder_id = Column(String(64), nullable=True)
    from_address = Column(String(255), nullable=True)
    from_name = Column(String(255), nullable=True)
    subject = Column(String(500), nullable=True)
    body_text = Column(Text, nullable=True)
    body_html = Column(Text, nullable=True)
    received_at = Column(DateTime, nullable=True)
    classification = Column(String(50), default="unclassified")
    job_requirement_id = Column(Integer, ForeignKey("job_requirements.id"), nullable=True, index=True)
    needs_review = Column(Boolean, default=False)
    # Workflow state, distinct from `classification` (AI content type):
    # pending | imported | linked | ignored | archived | failed
    import_status = Column(String(20), nullable=False, default="pending", index=True)
    imported_at = Column(DateTime, default=func.now())

    connection = relationship("ZohoConnection", back_populates="imported_emails")


class JobEmployeeSend(Base):
    """A job opportunity sent to an employee for review (Phase 7)."""

    __tablename__ = "job_employee_sends"

    id = Column(Integer, primary_key=True, index=True)
    job_requirement_id = Column(Integer, ForeignKey("job_requirements.id"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    sent_by = Column(String(255), nullable=True)
    sent_at = Column(DateTime, nullable=True)
    message_subject = Column(String(500), nullable=True)
    message_body = Column(Text, nullable=True)
    delivery_status = Column(String(50), default="Draft")  # Draft, Sent, Failed
    employee_response = Column(String(50), default="Pending")
    response_at = Column(DateTime, nullable=True)
    match_score_at_send = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    job = relationship("JobRequirement", foreign_keys=[job_requirement_id], viewonly=True)
    employee = relationship("Employee", foreign_keys=[employee_id], viewonly=True)


SUBMISSION_STATUSES = (
    "Draft", "Employee Contacted", "Employee Interested", "Submitted",
    "Client Review", "Interview", "Offer", "Selected", "Rejected", "Withdrawn", "Closed",
)
INTERVIEW_STATUSES = ("Scheduled", "Completed", "Cancelled", "No Show")
INTERVIEW_OUTCOMES = ("Pending", "Passed", "Failed")
OFFER_STATUSES = ("Draft", "Extended", "Accepted", "Declined", "Withdrawn")
ONBOARDING_STATUSES = ("Not Started", "In Progress", "Completed")


class Submission(Base):
    """Candidate submitted to a client/vendor for a job requirement (Phase 8)."""

    __tablename__ = "submissions"

    id = Column(Integer, primary_key=True, index=True)
    job_requirement_id = Column(Integer, ForeignKey("job_requirements.id"), nullable=False, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    recruiter_contact_id = Column(Integer, ForeignKey("crm_contacts.id"), nullable=True, index=True)
    vendor_id = Column(Integer, ForeignKey("crm_organizations.id"), nullable=True, index=True)
    job_employee_send_id = Column(Integer, ForeignKey("job_employee_sends.id"), nullable=True, index=True)
    submitted_rate = Column(String(100), nullable=True)
    rate_type = Column(String(50), nullable=True)
    submission_date = Column(DateTime, nullable=True)
    status = Column(String(50), default="Draft", index=True)
    vendor_reference = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    job = relationship("JobRequirement", foreign_keys=[job_requirement_id], viewonly=True)
    employee = relationship("Employee", foreign_keys=[employee_id], viewonly=True)
    recruiter_contact = relationship("CRMContact", foreign_keys=[recruiter_contact_id], viewonly=True)
    vendor_org = relationship("CRMOrganization", foreign_keys=[vendor_id], viewonly=True)
    interviews = relationship("Interview", back_populates="submission", cascade="all, delete-orphan")
    offers = relationship("Offer", back_populates="submission", cascade="all, delete-orphan")


class Interview(Base):
    __tablename__ = "interviews"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    scheduled_at = Column(DateTime, nullable=True)
    interview_type = Column(String(60), nullable=True)
    status = Column(String(50), default="Scheduled", index=True)
    interviewer_name = Column(String(255), nullable=True)
    location_or_link = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    feedback = Column(Text, nullable=True)
    outcome = Column(String(50), default="Pending")
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    submission = relationship("Submission", back_populates="interviews")


class Offer(Base):
    __tablename__ = "offers"

    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=False, index=True)
    offered_rate = Column(String(100), nullable=True)
    rate_type = Column(String(50), nullable=True)
    start_date = Column(String(30), nullable=True)
    offer_date = Column(DateTime, nullable=True)
    expiry_date = Column(String(30), nullable=True)
    status = Column(String(50), default="Draft", index=True)
    onboarding_status = Column(String(50), default="Not Started")
    notes = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    submission = relationship("Submission", back_populates="offers")


class CRMActivity(Base):
    """Interaction/timeline entry linked to CRM/ATS records."""

    __tablename__ = "crm_activities"

    id = Column(Integer, primary_key=True, index=True)
    activity_type = Column(String(60), nullable=False, default="Note")
    subject = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    organization_id = Column(Integer, ForeignKey("crm_organizations.id"), nullable=True, index=True)
    contact_id = Column(Integer, ForeignKey("crm_contacts.id"), nullable=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=True, index=True)
    job_requirement_id = Column(Integer, ForeignKey("job_requirements.id"), nullable=True, index=True)
    submission_id = Column(Integer, ForeignKey("submissions.id"), nullable=True, index=True)
    activity_date = Column(DateTime, default=func.now())
    due_date = Column(DateTime, nullable=True)
    status = Column(String(50), default="Open")
    assigned_to = Column(String(255), nullable=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class AtsStaffUser(Base):
    """ATS staff identity mapped from Clerk `sub` → role.

    Used when the session JWT does not carry public_metadata.role (common) and
    when the Clerk Backend API is unavailable. JobLens seeker Users table is
    unrelated — ATS staff are Clerk identities only.
    """

    __tablename__ = "ats_staff_users"

    id = Column(Integer, primary_key=True, index=True)
    clerk_user_id = Column(String(128), unique=True, nullable=False, index=True)
    email = Column(String(255), nullable=True, index=True)
    display_name = Column(String(255), nullable=True)
    role = Column(String(40), nullable=False, default="read_only", index=True)
    organization_name = Column(String(255), nullable=True)
    role_updated_at = Column(DateTime, nullable=True)
    role_updated_by = Column(String(128), nullable=True)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class AuditLog(Base):
    """Append-only record of important CRM/ATS actions for accountability."""

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(255), nullable=True, index=True)
    action = Column(String(120), nullable=False)
    entity_type = Column(String(80), nullable=True, index=True)
    entity_id = Column(String(80), nullable=True)
    summary = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=func.now())


# --- Auth schemas ---

class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class AiActivityResponse(BaseModel):
    id: int
    activity_type: str
    summary: str
    detail: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Pydantic schemas ---

class JobApplicationCreate(BaseModel):
    company: str
    role: str
    status: str = "Applied"
    job_url: Optional[str] = None
    notes: Optional[str] = None
    salary_range: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    recruiter_name: Optional[str] = None
    recruiter_email: Optional[str] = None
    follow_up_date: Optional[datetime] = None
    reminder_type: Optional[str] = None
    date_applied: Optional[datetime] = None
    source_job_requirement_id: Optional[int] = None
    application_source: Optional[str] = None
    application_method: Optional[str] = None


class JobApplicationUpdate(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    job_url: Optional[str] = None
    notes: Optional[str] = None
    salary_range: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    recruiter_name: Optional[str] = None
    recruiter_email: Optional[str] = None
    follow_up_date: Optional[datetime] = None
    reminder_type: Optional[str] = None


class JobApplicationResponse(BaseModel):
    id: int
    company: str
    role: str
    status: str
    date_applied: Optional[datetime]
    job_url: Optional[str]
    notes: Optional[str]
    salary_range: Optional[str]
    location: Optional[str]
    work_type: Optional[str]
    recruiter_name: Optional[str]
    recruiter_email: Optional[str]
    follow_up_date: Optional[datetime]
    reminder_type: Optional[str]
    source_job_requirement_id: Optional[int] = None
    application_source: Optional[str] = None
    application_method: Optional[str] = None
    application_opened_at: Optional[datetime] = None
    applied_at: Optional[datetime] = None
    recruiter_contacted_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None
    status_changed_at: Optional[datetime] = None
    status_changed_by: Optional[str] = None
    action_required: Optional[bool] = None
    action_required_reason: Optional[str] = None
    last_user_activity_at: Optional[datetime] = None
    reminder_completed_at: Optional[datetime] = None
    # Raw JSON string (same shape as the public JobRequirementResponse
    # projection) — parse client-side. Kept as the raw column rather than a
    # parsed dict so FastAPI's from_attributes can populate it automatically
    # across every endpoint that returns JobApplicationResponse.
    job_snapshot_json: Optional[str] = None
    created_at: datetime
    # Optional Apply Options warning fields (e.g. status saved but reminder failed).
    reminder_created: Optional[bool] = None
    warning_code: Optional[str] = None
    warning_message: Optional[str] = None

    model_config = {"from_attributes": True}


class ApplicationNoteCreate(BaseModel):
    content: str


class ApplicationNoteUpdate(BaseModel):
    content: str


class ApplicationNoteResponse(BaseModel):
    id: int
    job_application_id: int
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ApplicationStatusChangeRequest(BaseModel):
    status: str
    note: Optional[str] = None
    effective_date: Optional[datetime] = None
    confirmed: bool = False  # required for Withdrawn / Rejected / Archive restores


class ApplicationReminderUpdate(BaseModel):
    follow_up_date: Optional[datetime] = None
    reminder_type: Optional[str] = None
    completed: Optional[bool] = None
    snooze_days: Optional[int] = None


class ApplicationStatusSummary(BaseModel):
    total: int = 0
    by_status: dict[str, int] = {}
    applications_opened: int = 0
    applications_in_progress: int = 0
    applied: int = 0
    recruiter_contacts: int = 0
    interviews: int = 0
    offers: int = 0
    follow_ups_due: int = 0
    action_needed: int = 0
    opened_this_week: int = 0
    applied_this_week: int = 0
    percentages: dict[str, float] = {}


class ApplicationStatusListItem(BaseModel):
    id: int
    company: str
    role: str
    status: str
    location: Optional[str] = None
    work_type: Optional[str] = None
    application_method: Optional[str] = None
    application_method_label: Optional[str] = None
    application_source: Optional[str] = None
    job_url: Optional[str] = None
    has_application_url: bool = False
    source_job_requirement_id: Optional[int] = None
    source_job_available: bool = False
    source_job_closed: bool = False
    job_reference_number: Optional[str] = None
    client: Optional[str] = None
    end_client: Optional[str] = None
    recruiter_name: Optional[str] = None
    recruiter_email: Optional[str] = None
    application_opened_at: Optional[datetime] = None
    recruiter_contacted_at: Optional[datetime] = None
    applied_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    follow_up_date: Optional[datetime] = None
    reminder_type: Optional[str] = None
    reminder_completed_at: Optional[datetime] = None
    reminder_status: Optional[str] = None  # upcoming | due_today | missed | completed | none
    action_required: bool = False
    action_required_reason: Optional[str] = None
    archived_at: Optional[datetime] = None
    match_score: Optional[float] = None
    created_at: Optional[datetime] = None


class ApplicationStatusListResponse(BaseModel):
    items: list[ApplicationStatusListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    summary: ApplicationStatusSummary


class ApplicationTimelineEvent(BaseModel):
    id: Optional[int] = None
    event_type: str
    summary: str
    detail: Optional[str] = None
    occurred_at: datetime
    source: str = "activity"  # activity | derived


class ApplicationStatusDetailResponse(BaseModel):
    application: JobApplicationResponse
    job_snapshot: Optional[dict] = None
    source_job_available: bool = False
    source_job_closed: bool = False
    application_method_label: Optional[str] = None
    match_score: Optional[float] = None
    match_summary: Optional[str] = None
    timeline: list[ApplicationTimelineEvent] = []
    notes: list[ApplicationNoteResponse] = []
    reminder_status: Optional[str] = None
    action_required: bool = False
    action_required_reason: Optional[str] = None


class FollowUpEmailResponse(BaseModel):
    subject: str
    body: str


class SaveExternalJobRequest(BaseModel):
    """Save Job / Add to Tracker / Apply Now / Mark as Contacted, from a
    published CRM/ATS job — see routers/jobs.py's from-external endpoint.
    Idempotent: re-saving an already-tracked job updates it instead of
    creating a duplicate, and never downgrades a protected status."""

    job_requirement_id: int
    status: str = "Saved"
    application_method: Optional[str] = None  # employer_website | recruiter_email | manual


class MatchRequest(BaseModel):
    resume_text: str
    job_description: str
    company_name: Optional[str] = None
    job_requirement_id: Optional[int] = None


class CoverLetterRequest(BaseModel):
    resume_text: str
    job_description: str
    company_name: Optional[str] = None
    tone: Optional[str] = "professional"


class ExperienceEntry(BaseModel):
    title: str
    company: str
    start: Optional[str] = None
    end: Optional[str] = None
    description: Optional[str] = None

class EducationEntry(BaseModel):
    school: str
    degree: Optional[str] = None
    start: Optional[str] = None
    end: Optional[str] = None


class ProjectEntry(BaseModel):
    name: str
    description: Optional[str] = None
    url: Optional[str] = None
    technologies: Optional[list[str]] = None


class CertificationEntry(BaseModel):
    name: str
    issuer: Optional[str] = None
    date_earned: Optional[str] = None
    expiration: Optional[str] = None
    credential_url: Optional[str] = None


class ProfessionalLinks(BaseModel):
    linkedin: Optional[str] = None
    github: Optional[str] = None
    portfolio: Optional[str] = None
    personal_website: Optional[str] = None
    other: Optional[str] = None


class WorkAuthorization(BaseModel):
    applying_country: Optional[str] = None
    current_authorization: Optional[str] = None
    visa_type: Optional[str] = None
    sponsorship_required_now: Optional[bool] = None
    sponsorship_required_future: Optional[bool] = None
    authorization_expiration: Optional[str] = None
    authorized_countries: Optional[list[str]] = None
    willing_to_relocate: Optional[bool] = None
    security_clearance: Optional[bool] = None
    clearance_level: Optional[str] = None
    # Explicit user confirmation — never infer sensitive answers from resume text.
    user_confirmed: bool = False
    confirmed_at: Optional[datetime] = None


class JobPreferences(BaseModel):
    preferred_titles: Optional[list[str]] = None
    preferred_industries: Optional[list[str]] = None
    preferred_locations: Optional[list[str]] = None
    work_arrangement: Optional[str] = None  # remote | hybrid | onsite
    employment_types: Optional[list[str]] = None
    contract_preference: Optional[str] = None
    minimum_salary: Optional[float] = None
    minimum_hourly_rate: Optional[float] = None
    preferred_currency: Optional[str] = "USD"
    willing_to_travel: Optional[bool] = None
    max_travel_percentage: Optional[int] = None
    relocation_preference: Optional[str] = None
    available_start_date: Optional[str] = None


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    preferred_name: Optional[str] = None
    phone: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    location: Optional[str] = None
    current_location: Optional[str] = None
    headline: Optional[str] = None
    bio: Optional[str] = None
    skills: Optional[list[str]] = None
    experience: Optional[list[ExperienceEntry]] = None
    education: Optional[list[EducationEntry]] = None
    projects: Optional[list[ProjectEntry]] = None
    certifications: Optional[list[CertificationEntry]] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    professional_links: Optional[ProfessionalLinks] = None
    work_authorization: Optional[WorkAuthorization] = None
    job_preferences: Optional[JobPreferences] = None
    default_resume_id: Optional[int] = None
    default_cover_letter_id: Optional[int] = None


class ProfileCompletenessSection(BaseModel):
    key: str
    label: str
    weight: int
    complete: bool
    missing_fields: list[str] = []


class ProfileCompletenessResponse(BaseModel):
    overall_percentage: int
    completed_sections: list[str]
    incomplete_sections: list[str]
    missing_fields: list[str]
    recommended_next_action: Optional[str] = None
    sections: list[ProfileCompletenessSection] = []


class ApplicationReadinessResponse(BaseModel):
    status: str  # Ready | Mostly Ready | Needs Information | Not Ready
    score: int
    checks: dict[str, bool]
    missing: list[str] = []


class ProfileDocumentItem(BaseModel):
    id: int
    kind: str  # resume | cover_letter
    label: str
    created_at: Optional[datetime] = None
    is_default: bool = False


class ApplicationAnswerCreate(BaseModel):
    normalized_question_key: str
    display_question: str
    answer: str
    answer_type: str = "text"
    is_sensitive: Optional[bool] = None
    approval_status: str = "approved"
    reuse_policy: Optional[str] = None


class ApplicationAnswerUpdate(BaseModel):
    display_question: Optional[str] = None
    answer: Optional[str] = None
    answer_type: Optional[str] = None
    is_sensitive: Optional[bool] = None
    approval_status: Optional[str] = None
    reuse_policy: Optional[str] = None


class ApplicationAnswerResponse(BaseModel):
    id: int
    normalized_question_key: str
    display_question: str
    answer: str
    answer_type: str
    is_sensitive: bool
    approval_status: str
    reuse_policy: str
    last_reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ProfileResponse(BaseModel):
    # Auth-managed identity (read-only)
    email: Optional[str] = None
    email_editable: bool = False
    full_name: Optional[str] = None
    preferred_name: Optional[str] = None
    phone: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    location: Optional[str] = None
    current_location: Optional[str] = None
    headline: Optional[str] = None
    bio: Optional[str] = None
    skills: list[str] = []
    experience: list[ExperienceEntry] = []
    education: list[EducationEntry] = []
    projects: list[ProjectEntry] = []
    certifications: list[CertificationEntry] = []
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    professional_links: ProfessionalLinks = ProfessionalLinks()
    work_authorization: WorkAuthorization = WorkAuthorization()
    job_preferences: JobPreferences = JobPreferences()
    default_resume_id: Optional[int] = None
    default_cover_letter_id: Optional[int] = None
    documents: list[ProfileDocumentItem] = []
    application_answers: list[ApplicationAnswerResponse] = []
    completeness: Optional[ProfileCompletenessResponse] = None
    readiness: Optional[ApplicationReadinessResponse] = None
    profile_completion_percentage: Optional[int] = None
    profile_completed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Employee (ATS) schemas ---

class EmployeeBase(BaseModel):
    employee_code: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    preferred_name: Optional[str] = None
    personal_email: Optional[str] = None
    company_email: Optional[str] = None
    phone: Optional[str] = None
    alternate_phone: Optional[str] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    location: Optional[str] = None
    current_location: Optional[str] = None
    willing_to_relocate: Optional[bool] = None
    preferred_locations: Optional[str] = None
    work_authorization: Optional[str] = None
    visa_status: Optional[str] = None
    visa_expiration_date: Optional[str] = None
    sponsorship_required: Optional[bool] = None
    employment_type: Optional[str] = None
    current_employer: Optional[str] = None
    current_job_title: Optional[str] = None
    primary_skill: Optional[str] = None
    secondary_skills: Optional[str] = None
    total_experience: Optional[str] = None
    relevant_experience_years: Optional[str] = None
    availability: Optional[str] = None
    available_from: Optional[str] = None
    current_rate: Optional[str] = None
    expected_rate: Optional[str] = None
    rate_type: Optional[str] = None
    remote_preference: Optional[str] = None
    source: Optional[str] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    notes: Optional[str] = None


def _validate_optional_email(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    v = value.strip()
    if not v:
        return None
    # Light, dependency-free email shape check (full RFC validation is overkill
    # for internal CRM contact records that may be draft/imported).
    if "@" not in v or "." not in v.split("@")[-1] or " " in v:
        raise ValueError("Invalid email address.")
    return v


class EmployeeCreate(EmployeeBase):
    name: str
    email: str
    status: str = "Active"

    @field_validator("email")
    @classmethod
    def _check_email(cls, v: str) -> str:
        validated = _validate_optional_email(v)
        if not validated:
            raise ValueError("Email is required.")
        return validated

    @field_validator("personal_email", "company_email")
    @classmethod
    def _check_optional_emails(cls, v):
        return _validate_optional_email(v)


class EmployeeUpdate(EmployeeBase):
    name: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None

    @field_validator("email", "personal_email", "company_email")
    @classmethod
    def _check_emails(cls, v):
        return _validate_optional_email(v)


class EmployeeResponse(EmployeeBase):
    id: int
    name: str
    email: str
    status: str
    # Display-layer status (services/candidate_status.py) — never rewrites `status`.
    status_display: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmployeeListItem(EmployeeResponse):
    """Candidate/Employee row for the unified Candidates list — counts only, no resume text."""

    resume_count: int = 0
    resume_status: str = "None"  # None | Parsed | Failed
    has_primary_resume: bool = False
    match_count: int = 0
    submission_count: int = 0
    interview_count: int = 0
    offer_count: int = 0
    last_activity_at: Optional[datetime] = None


class EmployeeListResponse(BaseModel):
    items: list[EmployeeListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class EmployeeStatusUpdate(BaseModel):
    status: str


class CandidateDuplicateMatch(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str] = None
    status: str
    status_display: str
    match_reason: str  # email | phone | external_id | name_phone | name_email


class CandidateDuplicateCheckResponse(BaseModel):
    matches: list[CandidateDuplicateMatch]
    blocked: bool = False  # True when exact email/phone match (prefer open existing)


class CandidateCounts(BaseModel):
    resumes: int = 0
    matches: int = 0
    active_submissions: int = 0
    interviews: int = 0
    offers: int = 0
    placements: int = 0
    open_follow_ups: int = 0


# --- Employee Resume (ATS) schemas ---

class EmployeeResumeParseResponse(BaseModel):
    """Shape returned by services.claude_service.parse_employee_resume."""

    name: str = ""
    email: str = ""
    phone: str = ""
    primary_skill: str = ""
    skills: list[str] = []
    total_experience: str = ""
    job_titles: list[str] = []
    clients: list[str] = []
    certifications: list[str] = []
    education: list[str] = []
    summary: str = ""


class EmployeeResumeResponse(BaseModel):
    id: int
    employee_id: int
    filename: str
    file_type: str
    file_size: int
    file_path: str
    resume_text: Optional[str]
    parsed_name: Optional[str]
    parsed_email: Optional[str]
    parsed_phone: Optional[str]
    parsed_skills: list[str]
    parsed_primary_skill: Optional[str]
    parsed_total_experience: Optional[str]
    parsed_job_titles: list[str]
    parsed_clients: list[str]
    parsed_industries: list[str] = []
    parsed_certifications: list[str]
    parsed_education: list[str]
    parsed_summary: Optional[str]
    parsed_data: Optional[dict] = None
    parsing_status: str = "parsed"
    is_primary: bool
    version_number: Optional[int] = None
    uploaded_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ResumeFieldSuggestion(BaseModel):
    """A parsed value that conflicts with an existing non-empty employee field."""

    field: str
    label: str
    current_value: str
    resume_value: str


class ResumeUploadResult(BaseModel):
    """Returned by the resume upload/reparse endpoints so the UI can show what
    was auto-filled, what was left unchanged, and what needs manual review."""

    resume: EmployeeResumeResponse
    employee: EmployeeResponse
    parsed: dict
    parsing_status: str
    applied_fields: dict[str, str] = {}
    suggestions: list[ResumeFieldSuggestion] = []


class ApplyResumeSuggestionsRequest(BaseModel):
    # field name -> value the user chose to apply (only approved fields honored)
    fields: dict[str, str] = {}


# --- Job Requirement (ATS) schemas ---

class JobRequirementBase(BaseModel):
    external_job_id: Optional[str] = None
    job_reference_number: Optional[str] = None
    vendor: Optional[str] = None
    vendor_id: Optional[int] = None
    recruiter_name: Optional[str] = None
    recruiter_email: Optional[str] = None
    recruiter_phone: Optional[str] = None
    recruiter_contact_id: Optional[int] = None
    client: Optional[str] = None
    client_id: Optional[int] = None
    end_client: Optional[str] = None
    end_client_id: Optional[int] = None
    location: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    work_type: Optional[str] = None
    employment_type: Optional[str] = None
    contract_type: Optional[str] = None
    rate: Optional[str] = None
    rate_min: Optional[str] = None
    rate_max: Optional[str] = None
    rate_currency: Optional[str] = None
    rate_type: Optional[str] = None
    duration: Optional[str] = None
    visa_requirement: Optional[str] = None
    clearance_requirement: Optional[str] = None
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    minimum_experience: Optional[str] = None
    education_requirement: Optional[str] = None
    certification_requirement: Optional[str] = None
    job_description: Optional[str] = None
    application_url: Optional[str] = None
    application_platform: Optional[str] = None
    raw_email_text: Optional[str] = None
    submission_instructions: Optional[str] = None
    submission_deadline: Optional[str] = None
    number_of_openings: Optional[int] = None
    priority: str = "Medium"
    source: str = "Manual"
    notes: Optional[str] = None
    received_at: Optional[datetime] = None
    published_for_matching: bool = False
    review_status: str = "Draft"


class JobRequirementCreate(JobRequirementBase):
    job_title: str
    status: str = "New"


class JobRequirementUpdate(JobRequirementBase):
    job_title: Optional[str] = None
    status: Optional[str] = None


class JobRequirementResponse(JobRequirementBase):
    id: int
    job_title: str
    status: str
    # Normalized display status (Draft/Open/On Hold/Filled/Closed) — derived
    # from `status`, never stored. See services/job_status.py.
    status_display: str = "Draft"
    # Normalized source label (Zoho Email/Manual Entry/API Import/Other).
    source_label: str = "Other"
    # Resolved names for linked CRM records (populated when *_id is set).
    vendor_name: Optional[str] = None
    client_name: Optional[str] = None
    end_client_name: Optional[str] = None
    recruiter_contact_name: Optional[str] = None
    recruiter_link_status: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Efficient aggregate counts — never populated by loading full child
    # collections. Zero/None by default for freshly created jobs.
    candidate_count: int = 0
    submission_count: int = 0
    interview_count: int = 0
    offer_count: int = 0
    placement_count: int = 0
    last_activity_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class JobRequirementListResponse(BaseModel):
    items: list[JobRequirementResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class JobStatusUpdate(BaseModel):
    status: str  # one of JOB_STATUS_GROUPS (Draft/Open/On Hold/Filled/Closed)


# --- Public Job Matcher (candidate-facing browse of published ATS jobs) ---

class PublicJobListing(BaseModel):
    """Trimmed row for the Job Matcher's job picker — enough to populate a
    dropdown without pulling every job's full description repeatedly."""

    id: int
    job_title: str
    job_reference_number: Optional[str] = None
    client: Optional[str] = None
    vendor: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    employment_type: Optional[str] = None
    rate: Optional[str] = None
    required_skills: list[str] = []
    source: Optional[str] = None
    application_platform: Optional[str] = None
    application_url: Optional[str] = None
    recruiter_name: Optional[str] = None
    received_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class PublicJobListResponse(BaseModel):
    items: list[PublicJobListing]
    total: int
    page: int
    page_size: int
    total_pages: int


class JobRequirementParseRequest(BaseModel):
    raw_text: str


class JobRequirementParseResponse(BaseModel):
    job_title: str = ""
    job_reference_number: str = ""
    vendor: str = ""
    recruiter_name: str = ""
    recruiter_email: str = ""
    recruiter_phone: str = ""
    client: str = ""
    end_client: str = ""
    location: str = ""
    work_type: str = ""
    employment_type: str = ""
    contract_type: str = ""
    rate_min: Optional[str] = None
    rate_max: Optional[str] = None
    rate_currency: str = "USD"
    rate_type: str = ""
    duration: str = ""
    visa_requirement: str = ""
    clearance_requirement: str = ""
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    minimum_experience: str = ""
    education_requirement: str = ""
    certification_requirement: str = ""
    submission_deadline: str = ""
    number_of_openings: Optional[int] = None
    submission_instructions: str = ""
    application_url: str = ""
    application_platform: str = ""
    summary: str = ""

    model_config = {"from_attributes": True}


class JobCandidateItem(BaseModel):
    """A candidate connected to a job via a match/send, a submission, or both."""

    employee_id: int
    employee_name: str
    current_title: Optional[str] = None
    skills: list[str] = []
    work_authorization: Optional[str] = None
    match_score: Optional[int] = None
    match_recommendation: Optional[str] = None
    submission_id: Optional[int] = None
    submission_status: Optional[str] = None
    linked_via: list[str] = []


class JobEmployeeMatchResult(BaseModel):
    employee_id: int
    employee_name: str
    primary_skill: Optional[str] = None
    match_score: int
    matching_skills: list[str] = []
    preferred_matching_skills: list[str] = []
    missing_skills: list[str] = []
    compatibility_warnings: list[str] = []
    match_reason: str = ""
    score_breakdown: dict[str, int] = {}
    work_authorization: Optional[str] = None
    availability: Optional[str] = None
    expected_rate: Optional[str] = None
    total_experience: Optional[str] = None


EMPLOYEE_RESPONSE_VALUES = (
    "Pending", "Interested", "Not Interested", "Need More Information", "Not Available",
)
DELIVERY_STATUS_VALUES = ("Draft", "Sent", "Failed")


class JobSendCreate(BaseModel):
    employee_id: int
    message_subject: Optional[str] = None
    message_body: Optional[str] = None
    mark_sent: bool = False
    notes: Optional[str] = None


class JobSendUpdate(BaseModel):
    message_subject: Optional[str] = None
    message_body: Optional[str] = None
    delivery_status: Optional[str] = None
    employee_response: Optional[str] = None
    notes: Optional[str] = None


class JobSendResponse(BaseModel):
    id: int
    job_requirement_id: int
    employee_id: int
    job_title: Optional[str] = None
    employee_name: Optional[str] = None
    employee_email: Optional[str] = None
    sent_by: Optional[str] = None
    sent_at: Optional[datetime] = None
    message_subject: Optional[str] = None
    message_body: Optional[str] = None
    delivery_status: str
    employee_response: str
    response_at: Optional[datetime] = None
    match_score_at_send: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobSendDraftResponse(BaseModel):
    subject: str
    body: str
    employee_email: Optional[str] = None
    employee_name: Optional[str] = None


# --- CRM Organization schemas ---

class CRMOrganizationBase(BaseModel):
    organization_name: str
    organization_type: str = "Staffing Vendor"
    website: Optional[str] = None
    email_domain: Optional[str] = None
    industry: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    status: str = "Active"
    preferred_vendor_status: Optional[str] = None
    payment_terms: Optional[str] = None
    contract_status: Optional[str] = None
    msa_status: Optional[str] = None
    notes: Optional[str] = None


class CRMOrganizationCreate(CRMOrganizationBase):
    pass


class CRMOrganizationUpdate(BaseModel):
    organization_name: Optional[str] = None
    organization_type: Optional[str] = None
    website: Optional[str] = None
    email_domain: Optional[str] = None
    industry: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    status: Optional[str] = None
    preferred_vendor_status: Optional[str] = None
    payment_terms: Optional[str] = None
    contract_status: Optional[str] = None
    msa_status: Optional[str] = None
    needs_review: Optional[bool] = None
    notes: Optional[str] = None


class CRMOrganizationResponse(CRMOrganizationBase):
    id: int
    needs_review: bool = False
    source: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    # Phase 6 Unified Contacts — display + relationship counts
    organization_type_display: Optional[str] = None
    status_display: Optional[str] = None
    source_display: Optional[str] = None
    contact_count: int = 0
    open_job_count: int = 0
    active_pipeline_count: int = 0
    interview_count: int = 0
    offer_count: int = 0
    placement_count: int = 0
    primary_contact_name: Optional[str] = None
    next_follow_up_at: Optional[datetime] = None
    follow_up_overdue: bool = False
    last_activity_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class CRMOrganizationListItem(CRMOrganizationResponse):
    """Company list row — notes omitted from serialization."""

    notes: Optional[str] = Field(default=None, exclude=True)


class CRMOrganizationListResponse(BaseModel):
    items: list[CRMOrganizationListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class CompanyDuplicateMatch(BaseModel):
    id: int
    organization_name: str
    organization_type: Optional[str] = None
    organization_type_display: Optional[str] = None
    email_domain: Optional[str] = None
    status: Optional[str] = None
    status_display: Optional[str] = None
    match_reason: str  # domain | name


class CompanyDuplicateCheckResponse(BaseModel):
    matches: list[CompanyDuplicateMatch]
    blocked: bool = False


class OrganizationStatusUpdate(BaseModel):
    status: str


class LinkContactBody(BaseModel):
    contact_id: int


# --- CRM Contact schemas ---

class CRMContactBase(BaseModel):
    organization_id: Optional[int] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    job_title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    contact_type: str = "Recruiter"
    status: str = "Active"
    linkedin_url: Optional[str] = None
    preferred_contact_method: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("email")
    @classmethod
    def _check_contact_email(cls, v):
        return _validate_optional_email(v)


class CRMContactCreate(CRMContactBase):
    pass


class CRMContactUpdate(BaseModel):
    organization_id: Optional[int] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    job_title: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    contact_type: Optional[str] = None
    status: Optional[str] = None
    linkedin_url: Optional[str] = None
    preferred_contact_method: Optional[str] = None
    needs_review: Optional[bool] = None
    notes: Optional[str] = None

    @field_validator("email")
    @classmethod
    def _check_contact_email(cls, v):
        return _validate_optional_email(v)


class CRMContactResponse(CRMContactBase):
    id: int
    needs_review: bool = False
    source: Optional[str] = None
    last_contacted_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    organization_name: Optional[str] = None
    # Phase 6 Unified Contacts
    contact_type_display: Optional[str] = None
    status_display: Optional[str] = None
    source_display: Optional[str] = None
    open_job_count: int = 0
    active_pipeline_count: int = 0
    next_follow_up_at: Optional[datetime] = None
    follow_up_overdue: bool = False
    last_activity_at: Optional[datetime] = None
    display_name: Optional[str] = None

    model_config = {"from_attributes": True}


class CRMContactListItem(CRMContactResponse):
    """Contact list row — notes omitted from serialization."""

    notes: Optional[str] = Field(default=None, exclude=True)


class CRMContactListResponse(BaseModel):
    items: list[CRMContactListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class ContactDuplicateMatch(BaseModel):
    id: int
    display_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_type: Optional[str] = None
    contact_type_display: Optional[str] = None
    status: Optional[str] = None
    status_display: Optional[str] = None
    organization_id: Optional[int] = None
    match_reason: str  # email | phone


class ContactDuplicateCheckResponse(BaseModel):
    matches: list[ContactDuplicateMatch]
    blocked: bool = False


class MarkContactedBody(BaseModel):
    method: str  # email | phone | sms | linkedin | meeting | other
    contacted_at: Optional[datetime] = None
    subject: Optional[str] = None
    notes: Optional[str] = None
    complete_follow_up_id: Optional[int] = None


class ContactStatusUpdate(BaseModel):
    status: str


# --- CRM Activity schemas ---

class CRMActivityBase(BaseModel):
    activity_type: str = "Note"
    subject: Optional[str] = None
    description: Optional[str] = None
    organization_id: Optional[int] = None
    contact_id: Optional[int] = None
    employee_id: Optional[int] = None
    job_requirement_id: Optional[int] = None
    submission_id: Optional[int] = None
    due_date: Optional[datetime] = None
    status: str = "Open"
    assigned_to: Optional[str] = None


class CRMActivityCreate(CRMActivityBase):
    pass


class CRMActivityUpdate(BaseModel):
    activity_type: Optional[str] = None
    subject: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    due_date: Optional[datetime] = None
    assigned_to: Optional[str] = None


class CRMActivityResponse(CRMActivityBase):
    id: int
    activity_date: datetime
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Phase 8: Submissions, Interviews, Offers ---

class SubmissionBase(BaseModel):
    job_requirement_id: int
    employee_id: int
    recruiter_contact_id: Optional[int] = None
    vendor_id: Optional[int] = None
    job_employee_send_id: Optional[int] = None
    submitted_rate: Optional[str] = None
    rate_type: Optional[str] = None
    submission_date: Optional[datetime] = None
    status: str = "Draft"
    vendor_reference: Optional[str] = None
    notes: Optional[str] = None


class SubmissionCreate(SubmissionBase):
    pass


class SubmissionUpdate(BaseModel):
    recruiter_contact_id: Optional[int] = None
    vendor_id: Optional[int] = None
    submitted_rate: Optional[str] = None
    rate_type: Optional[str] = None
    submission_date: Optional[datetime] = None
    status: Optional[str] = None
    vendor_reference: Optional[str] = None
    notes: Optional[str] = None


class SubmissionResponse(SubmissionBase):
    id: int
    job_title: Optional[str] = None
    employee_name: Optional[str] = None
    vendor_name: Optional[str] = None
    recruiter_name: Optional[str] = None
    client_name: Optional[str] = None
    # Pipeline display (services/pipeline_status.py) — never rewrites `status`.
    status_display: Optional[str] = None
    status_group: Optional[str] = None
    stage_order: Optional[int] = None
    match_score: Optional[int] = None
    resume_filename: Optional[str] = None
    next_interview_at: Optional[datetime] = None
    offer_status: Optional[str] = None
    next_follow_up_at: Optional[datetime] = None
    follow_up_overdue: bool = False
    last_activity_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubmissionListResponse(BaseModel):
    items: list[SubmissionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class PipelineSummaryCounts(BaseModel):
    active: int = 0
    submitted: int = 0
    interview: int = 0
    offer: int = 0
    placed: int = 0
    follow_ups_due: int = 0


class PipelineStageUpdate(BaseModel):
    stage: str
    reason: Optional[str] = None
    confirmed: bool = False
    resume_override_reason: Optional[str] = None  # admin when moving to Submitted without resume


class PipelineRejectBody(BaseModel):
    reason: str
    notes: Optional[str] = None
    stage: str = "Rejected"


class PipelineWithdrawBody(BaseModel):
    reason: str
    notes: Optional[str] = None
    effective_date: Optional[datetime] = None


class PipelinePlaceBody(BaseModel):
    confirmed: bool = True
    start_date: Optional[str] = None
    final_rate: Optional[str] = None
    fill_job: bool = False
    offer_id: Optional[int] = None
    override_reason: Optional[str] = None


class InterviewBase(BaseModel):
    submission_id: int
    scheduled_at: Optional[datetime] = None
    interview_type: Optional[str] = None
    status: str = "Scheduled"
    interviewer_name: Optional[str] = None
    location_or_link: Optional[str] = None
    notes: Optional[str] = None
    feedback: Optional[str] = None
    outcome: str = "Pending"


class InterviewCreate(InterviewBase):
    pass


class InterviewUpdate(BaseModel):
    scheduled_at: Optional[datetime] = None
    interview_type: Optional[str] = None
    status: Optional[str] = None
    interviewer_name: Optional[str] = None
    location_or_link: Optional[str] = None
    notes: Optional[str] = None
    feedback: Optional[str] = None
    outcome: Optional[str] = None


class InterviewResponse(InterviewBase):
    id: int
    job_title: Optional[str] = None
    employee_name: Optional[str] = None
    submission_status: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OfferBase(BaseModel):
    submission_id: int
    offered_rate: Optional[str] = None
    rate_type: Optional[str] = None
    start_date: Optional[str] = None
    offer_date: Optional[datetime] = None
    expiry_date: Optional[str] = None
    status: str = "Draft"
    onboarding_status: str = "Not Started"
    notes: Optional[str] = None


class OfferCreate(OfferBase):
    pass


class OfferUpdate(BaseModel):
    offered_rate: Optional[str] = None
    rate_type: Optional[str] = None
    start_date: Optional[str] = None
    offer_date: Optional[datetime] = None
    expiry_date: Optional[str] = None
    status: Optional[str] = None
    onboarding_status: Optional[str] = None
    notes: Optional[str] = None


class OfferResponse(OfferBase):
    id: int
    job_title: Optional[str] = None
    employee_name: Optional[str] = None
    submission_status: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- ATS Dashboard ---

class AtsDashboardRecentJob(BaseModel):
    id: int
    job_title: str
    vendor: Optional[str] = None


class AtsDashboardRecentEmployee(BaseModel):
    id: int
    name: str
    primary_skill: Optional[str] = None


class AtsDashboardDeadline(BaseModel):
    id: int
    job_title: str
    submission_deadline: Optional[str] = None
    vendor: Optional[str] = None


class AtsDashboardEmailItem(BaseModel):
    id: int
    subject: Optional[str] = None
    from_name: Optional[str] = None
    classification: str
    imported_at: datetime


class AtsDashboardJobItem(BaseModel):
    id: int
    job_title: str
    vendor: Optional[str] = None
    status: str


class AtsDashboardMatchItem(BaseModel):
    job_requirement_id: int
    employee_id: int
    job_title: Optional[str] = None
    employee_name: Optional[str] = None
    match_score: Optional[int] = None


class AtsDashboardActivityItem(BaseModel):
    id: int
    activity_type: str
    subject: Optional[str] = None
    activity_date: datetime
    status: str


class AtsDashboardStats(BaseModel):
    total_employees: int = 0
    active_employees: int
    bench_employees: int
    available_now: int = 0
    open_jobs: int
    new_jobs_today: int = 0
    new_email_jobs: int
    pending_matches: int
    submissions: int
    pending_employee_responses: int = 0
    zoho_emails_awaiting_review: int = 0
    interviews: int
    offers: int
    organizations: int
    contacts: int
    recent_jobs: list[AtsDashboardRecentJob]
    recent_employees: list[AtsDashboardRecentEmployee]
    upcoming_deadlines: list[AtsDashboardDeadline] = []
    recent_zoho_emails: list[AtsDashboardEmailItem] = []
    jobs_needing_review: list[AtsDashboardJobItem] = []
    top_matches: list[AtsDashboardMatchItem] = []
    recent_activities: list[AtsDashboardActivityItem] = []


# --- Zoho Mail integration ---

class ZohoAuthorizeResponse(BaseModel):
    authorize_url: str


class ZohoOAuthCallbackRequest(BaseModel):
    code: str
    state: str


class ZohoConnectionStatus(BaseModel):
    connected: bool
    status: str = "Disconnected"
    mailbox_email: Optional[str] = None
    zoho_account_id: Optional[str] = None
    last_sync_at: Optional[datetime] = None
    last_error: Optional[str] = None


class ZohoSyncResponse(BaseModel):
    imported: int
    skipped: int
    total_fetched: int


class ImportedEmailResponse(BaseModel):
    id: int
    zoho_message_id: str
    from_address: Optional[str] = None
    from_name: Optional[str] = None
    subject: Optional[str] = None
    received_at: Optional[datetime] = None
    classification: str
    needs_review: bool
    job_requirement_id: Optional[int] = None
    import_status: str = "pending"
    preview: Optional[str] = None
    imported_at: datetime

    model_config = {"from_attributes": True}


class ImportedEmailDetailResponse(ImportedEmailResponse):
    body_text: Optional[str] = None
    body_html: Optional[str] = None


class EmailClassificationResponse(BaseModel):
    id: int
    classification: str
    reason: str
    needs_review: bool


class EmailClassifyBatchResponse(BaseModel):
    classified: int
    results: list[EmailClassificationResponse]


class CreateJobFromEmailResponse(BaseModel):
    email: ImportedEmailResponse
    job: "JobRequirementResponse"


class ImportedEmailUpdate(BaseModel):
    classification: Optional[str] = None
    needs_review: Optional[bool] = None


class LinkEmailToJobRequest(BaseModel):
    job_requirement_id: int


# --- Unified Dashboard (Recruitment CRM + ATS) ---

class DashboardSummaryCounts(BaseModel):
    open_jobs: int
    new_zoho_jobs: int
    active_candidates: int
    candidates_submitted: int
    interviews_scheduled: int
    offers: int
    placements: int
    follow_ups_due: int


class DashboardActivityItem(BaseModel):
    id: int
    activity_type: str
    subject: Optional[str] = None
    description: Optional[str] = None
    activity_date: datetime
    created_by: Optional[str] = None
    job_requirement_id: Optional[int] = None
    job_title: Optional[str] = None
    contact_id: Optional[int] = None
    contact_name: Optional[str] = None
    organization_id: Optional[int] = None
    organization_name: Optional[str] = None
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None
    submission_id: Optional[int] = None


class DashboardFollowUpItem(BaseModel):
    id: int
    subject: Optional[str] = None
    due_date: Optional[datetime] = None
    overdue: bool
    job_requirement_id: Optional[int] = None
    job_title: Optional[str] = None
    contact_id: Optional[int] = None
    contact_name: Optional[str] = None
    organization_id: Optional[int] = None
    organization_name: Optional[str] = None
    employee_id: Optional[int] = None
    employee_name: Optional[str] = None


class DashboardZohoJobItem(BaseModel):
    id: int
    job_title: str
    recruiter_name: Optional[str] = None
    company: Optional[str] = None
    received_at: Optional[datetime] = None
    review_status: str
    status: str


class DashboardPipelineStage(BaseModel):
    stage: str
    count: int


class DashboardSummaryResponse(BaseModel):
    scope: str  # "organization" | "own"
    zoho_connected: bool
    counts: DashboardSummaryCounts
    recent_activities: list[DashboardActivityItem]
    follow_ups_due: list[DashboardFollowUpItem]
    recent_zoho_jobs: list[DashboardZohoJobItem]
    pipeline: list[DashboardPipelineStage]
