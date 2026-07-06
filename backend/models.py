from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from pydantic import BaseModel, EmailStr, field_validator
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
    guest_id = Column(String(36), nullable=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
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
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, unique=True, index=True)
    phone = Column(String(50), nullable=True)
    location = Column(String(255), nullable=True)
    headline = Column(String(255), nullable=True)
    bio = Column(Text, nullable=True)
    skills = Column(Text, nullable=True)       # JSON-encoded list[str]
    experience = Column(Text, nullable=True)   # JSON-encoded list[dict]
    education = Column(Text, nullable=True)    # JSON-encoded list[dict]
    linkedin_url = Column(String(500), nullable=True)
    portfolio_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class Employee(Base):
    """ATS employee/consultant record — private admin data, never exposed via
    public (guest_id-based) routes. See backend/ats_auth.py for the TODO on
    gating these endpoints with verified Clerk sessions."""

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
    """Private ATS job requirement — created manually (paste an email/JD) for
    now; future steps will match these to employees. See backend/ats_auth.py
    for the TODO on gating these endpoints with verified Clerk sessions."""

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
    raw_email_text = Column(Text, nullable=True)
    submission_instructions = Column(Text, nullable=True)
    submission_deadline = Column(String(50), nullable=True)
    number_of_openings = Column(Integer, nullable=True)
    status = Column(String(50), default="New")
    priority = Column(String(20), default="Medium")
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
    submission_id = Column(Integer, nullable=True, index=True)
    activity_date = Column(DateTime, default=func.now())
    due_date = Column(DateTime, nullable=True)
    status = Column(String(50), default="Open")
    assigned_to = Column(String(255), nullable=True)
    created_by = Column(String(255), nullable=True)
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
    created_at: datetime

    model_config = {"from_attributes": True}


class FollowUpEmailResponse(BaseModel):
    subject: str
    body: str


class MatchRequest(BaseModel):
    resume_text: str
    job_description: str


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

class ProfileUpdate(BaseModel):
    phone: Optional[str] = None
    location: Optional[str] = None
    headline: Optional[str] = None
    bio: Optional[str] = None
    skills: Optional[list[str]] = None
    experience: Optional[list[ExperienceEntry]] = None
    education: Optional[list[EducationEntry]] = None
    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None

class ProfileResponse(BaseModel):
    phone: Optional[str]
    location: Optional[str]
    headline: Optional[str]
    bio: Optional[str]
    skills: list[str]
    experience: list[ExperienceEntry]
    education: list[EducationEntry]
    linkedin_url: Optional[str]
    portfolio_url: Optional[str]
    updated_at: datetime

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
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmployeeListItem(EmployeeResponse):
    """Employee row for the ATS list view — includes resume summary metadata."""

    resume_count: int = 0
    resume_status: str = "None"  # None | Parsed | Failed
    has_primary_resume: bool = False


class EmployeeListResponse(BaseModel):
    items: list[EmployeeListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


class EmployeeStatusUpdate(BaseModel):
    status: str


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
    raw_email_text: Optional[str] = None
    submission_instructions: Optional[str] = None
    submission_deadline: Optional[str] = None
    number_of_openings: Optional[int] = None
    priority: str = "Medium"
    source: str = "Manual"
    notes: Optional[str] = None
    received_at: Optional[datetime] = None


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
    # Resolved names for linked CRM records (populated when *_id is set).
    vendor_name: Optional[str] = None
    client_name: Optional[str] = None
    end_client_name: Optional[str] = None
    recruiter_contact_name: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobRequirementListResponse(BaseModel):
    items: list[JobRequirementResponse]
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
    summary: str = ""

    model_config = {"from_attributes": True}


class JobEmployeeMatchResult(BaseModel):
    employee_id: int
    employee_name: str
    primary_skill: Optional[str] = None
    match_score: int
    matching_skills: list[str] = []
    missing_skills: list[str] = []
    compatibility_warnings: list[str] = []
    match_reason: str = ""
    work_authorization: Optional[str] = None
    availability: Optional[str] = None
    expected_rate: Optional[str] = None
    total_experience: Optional[str] = None


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

    model_config = {"from_attributes": True}


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

    model_config = {"from_attributes": True}


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
