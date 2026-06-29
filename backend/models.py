from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
from pydantic import BaseModel, EmailStr
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
    name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    phone = Column(String(50), nullable=True)
    location = Column(String(255), nullable=True)
    visa_status = Column(String(50), nullable=True)
    availability = Column(String(50), nullable=True)
    expected_rate = Column(String(100), nullable=True)
    primary_skill = Column(String(255), nullable=True)
    secondary_skills = Column(Text, nullable=True)
    total_experience = Column(String(50), nullable=True)
    status = Column(String(50), default="Active")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    resumes = relationship("EmployeeResume", back_populates="employee", cascade="all, delete-orphan")


class EmployeeResume(Base):
    """One employee can have many resumes; each belongs to exactly one employee."""

    __tablename__ = "employee_resumes"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    file_type = Column(String(20), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_path = Column(String(500), nullable=False)
    resume_text = Column(Text, nullable=True)
    parsed_name = Column(String(255), nullable=True)
    parsed_email = Column(String(255), nullable=True)
    parsed_phone = Column(String(50), nullable=True)
    parsed_skills = Column(Text, nullable=True)              # JSON-encoded list[str]
    parsed_primary_skill = Column(String(255), nullable=True)
    parsed_total_experience = Column(String(50), nullable=True)
    parsed_job_titles = Column(Text, nullable=True)           # JSON-encoded list[str]
    parsed_clients = Column(Text, nullable=True)              # JSON-encoded list[str]
    parsed_certifications = Column(Text, nullable=True)       # JSON-encoded list[str]
    parsed_education = Column(Text, nullable=True)            # JSON-encoded list[str]
    parsed_summary = Column(Text, nullable=True)
    is_primary = Column(Boolean, default=True)
    uploaded_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    employee = relationship("Employee", back_populates="resumes")


class JobRequirement(Base):
    """Private ATS job requirement — created manually (paste an email/JD) for
    now; future steps will match these to employees. See backend/ats_auth.py
    for the TODO on gating these endpoints with verified Clerk sessions."""

    __tablename__ = "job_requirements"

    id = Column(Integer, primary_key=True, index=True)
    job_title = Column(String(255), nullable=False)
    vendor = Column(String(255), nullable=True)
    recruiter_name = Column(String(255), nullable=True)
    recruiter_email = Column(String(255), nullable=True)
    recruiter_phone = Column(String(50), nullable=True)
    client = Column(String(255), nullable=True)
    end_client = Column(String(255), nullable=True)
    location = Column(String(255), nullable=True)
    work_type = Column(String(50), nullable=True)
    rate = Column(String(100), nullable=True)
    duration = Column(String(100), nullable=True)
    visa_requirement = Column(String(255), nullable=True)
    required_skills = Column(Text, nullable=True)    # JSON-encoded list[str]
    preferred_skills = Column(Text, nullable=True)   # JSON-encoded list[str]
    job_description = Column(Text, nullable=True)
    raw_email_text = Column(Text, nullable=True)
    submission_deadline = Column(String(50), nullable=True)
    status = Column(String(50), default="New")
    priority = Column(String(20), default="Medium")
    source = Column(String(50), default="Manual")
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

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

class EmployeeCreate(BaseModel):
    name: str
    email: str
    phone: Optional[str] = None
    location: Optional[str] = None
    visa_status: Optional[str] = None
    availability: Optional[str] = None
    expected_rate: Optional[str] = None
    primary_skill: Optional[str] = None
    secondary_skills: Optional[str] = None
    total_experience: Optional[str] = None
    status: str = "Active"
    notes: Optional[str] = None


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    visa_status: Optional[str] = None
    availability: Optional[str] = None
    expected_rate: Optional[str] = None
    primary_skill: Optional[str] = None
    secondary_skills: Optional[str] = None
    total_experience: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class EmployeeResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: Optional[str]
    location: Optional[str]
    visa_status: Optional[str]
    availability: Optional[str]
    expected_rate: Optional[str]
    primary_skill: Optional[str]
    secondary_skills: Optional[str]
    total_experience: Optional[str]
    status: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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
    parsed_certifications: list[str]
    parsed_education: list[str]
    parsed_summary: Optional[str]
    is_primary: bool
    uploaded_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Job Requirement (ATS) schemas ---

class JobRequirementCreate(BaseModel):
    job_title: str
    vendor: Optional[str] = None
    recruiter_name: Optional[str] = None
    recruiter_email: Optional[str] = None
    recruiter_phone: Optional[str] = None
    client: Optional[str] = None
    end_client: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    rate: Optional[str] = None
    duration: Optional[str] = None
    visa_requirement: Optional[str] = None
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    job_description: Optional[str] = None
    raw_email_text: Optional[str] = None
    submission_deadline: Optional[str] = None
    status: str = "New"
    priority: str = "Medium"
    source: str = "Manual"
    notes: Optional[str] = None


class JobRequirementUpdate(BaseModel):
    job_title: Optional[str] = None
    vendor: Optional[str] = None
    recruiter_name: Optional[str] = None
    recruiter_email: Optional[str] = None
    recruiter_phone: Optional[str] = None
    client: Optional[str] = None
    end_client: Optional[str] = None
    location: Optional[str] = None
    work_type: Optional[str] = None
    rate: Optional[str] = None
    duration: Optional[str] = None
    visa_requirement: Optional[str] = None
    required_skills: Optional[list[str]] = None
    preferred_skills: Optional[list[str]] = None
    job_description: Optional[str] = None
    raw_email_text: Optional[str] = None
    submission_deadline: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    source: Optional[str] = None
    notes: Optional[str] = None


class JobRequirementResponse(BaseModel):
    id: int
    job_title: str
    vendor: Optional[str]
    recruiter_name: Optional[str]
    recruiter_email: Optional[str]
    recruiter_phone: Optional[str]
    client: Optional[str]
    end_client: Optional[str]
    location: Optional[str]
    work_type: Optional[str]
    rate: Optional[str]
    duration: Optional[str]
    visa_requirement: Optional[str]
    required_skills: list[str]
    preferred_skills: list[str]
    job_description: Optional[str]
    raw_email_text: Optional[str]
    submission_deadline: Optional[str]
    status: str
    priority: str
    source: str
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class JobRequirementParseRequest(BaseModel):
    raw_text: str


class JobRequirementParseResponse(BaseModel):
    job_title: str = ""
    vendor: str = ""
    recruiter_name: str = ""
    recruiter_email: str = ""
    recruiter_phone: str = ""
    client: str = ""
    end_client: str = ""
    location: str = ""
    work_type: str = ""
    rate: str = ""
    duration: str = ""
    visa_requirement: str = ""
    required_skills: list[str] = []
    preferred_skills: list[str] = []
    submission_deadline: str = ""
    summary: str = ""

    model_config = {"from_attributes": True}
