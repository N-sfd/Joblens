from sqlalchemy import Column, Integer, String, Text, DateTime, Float
from sqlalchemy.sql import func
from database import Base
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# --- SQLAlchemy ORM models ---

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
    follow_up_date = Column(DateTime, nullable=True)
    guest_id = Column(String(36), nullable=True, index=True)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())


class ResumeAnalysis(Base):
    __tablename__ = "resume_analyses"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255))
    ats_score = Column(Float)
    analysis_json = Column(Text)
    created_at = Column(DateTime, default=func.now())


# --- Pydantic schemas ---

class JobApplicationCreate(BaseModel):
    company: str
    role: str
    status: str = "Applied"
    job_url: Optional[str] = None
    notes: Optional[str] = None
    salary_range: Optional[str] = None
    location: Optional[str] = None
    follow_up_date: Optional[datetime] = None
    date_applied: Optional[datetime] = None


class JobApplicationUpdate(BaseModel):
    company: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    job_url: Optional[str] = None
    notes: Optional[str] = None
    salary_range: Optional[str] = None
    location: Optional[str] = None
    follow_up_date: Optional[datetime] = None


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
    follow_up_date: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}


class MatchRequest(BaseModel):
    resume_text: str
    job_description: str


class CoverLetterRequest(BaseModel):
    resume_text: str
    job_description: str
    company_name: Optional[str] = None
    tone: Optional[str] = "professional"
