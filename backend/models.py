from sqlalchemy import Column, Integer, String, Text, DateTime, Float
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
