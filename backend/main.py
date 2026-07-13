from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from pathlib import Path
import os

load_dotenv(Path(__file__).resolve().parent / ".env")

from database import create_tables
from routers import resume, jobs, match, cover_letter, auth, activity, account, profile, public_jobs, employees, employee_resumes, job_requirements, job_sends, submissions, interviews, offers, crm_organizations, crm_contacts, crm_activities, ats_dashboard, zoho, applications
from ats_auth import ENFORCE, CLERK_JWKS_URL, CLERK_ISSUER
from services.storage import STORAGE_PROVIDER, validate_storage_config
import logging

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    env = os.getenv("ENV", "development").strip().lower()
    if ENFORCE:
        missing = []
        if not CLERK_JWKS_URL:
            missing.append("CLERK_JWKS_URL")
        if not CLERK_ISSUER:
            missing.append("CLERK_ISSUER")
        if missing:
            raise RuntimeError(
                f"ATS_AUTH_ENFORCE=true but missing: {', '.join(missing)}. "
                "Set Clerk env vars on Render before enabling enforcement."
            )
    elif env == "production":
        raise RuntimeError(
            "ENV=production but ATS_AUTH_ENFORCE is not set to true — the private ATS/CRM "
            "API would boot unauthenticated. Set ATS_AUTH_ENFORCE=true (and the Clerk env "
            "vars) on Render before deploying."
        )
    validate_storage_config()
    if env == "production" and STORAGE_PROVIDER == "local":
        logger.warning(
            "STORAGE_PROVIDER=local in production — uploaded employee resumes will be lost "
            "on every redeploy (Render's disk is ephemeral). Set STORAGE_PROVIDER=supabase."
        )
    if not os.getenv("GROQ_API_KEY", "").strip():
        logger.warning("GROQ_API_KEY is not set — resume/job AI parsing will fail.")
    create_tables()
    yield


app = FastAPI(
    title="JobLens API",
    description="Resume analysis, job matching, cover letter generation, and job tracking.",
    version="1.0.0",
    lifespan=lifespan,
)

def _normalize_cors_origin(entry: str) -> str:
    """Allow Render env like 'myapp.vercel.app' without scheme (browser sends https://...)."""
    p = entry.strip()
    if not p:
        return ""
    if p.startswith(("http://", "https://")):
        return p.rstrip("/")
    if p.startswith(("localhost", "127.0.0.1")):
        return f"http://{p}".rstrip("/")
    return f"https://{p}".rstrip("/")


def _parse_allowed_origins(raw: str) -> list[str]:
    origins = [_normalize_cors_origin(x) for x in raw.split(",")]
    return [o for o in origins if o] or ["http://localhost:3000"]


allowed_origins = _parse_allowed_origins(os.getenv("ALLOWED_ORIGINS", "http://localhost:3000"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(profile.router, prefix="/api/profile", tags=["Profile"])
app.include_router(resume.router, prefix="/api/resume", tags=["Resume"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(applications.router, prefix="/api/applications", tags=["Application Status"])
app.include_router(match.router, prefix="/api/match", tags=["Match"])
app.include_router(cover_letter.router, prefix="/api/cover-letter", tags=["Cover Letter"])
app.include_router(activity.router, prefix="/api/activity", tags=["Activity"])
app.include_router(account.router, prefix="/api/account", tags=["Account"])
# CRM/ATS → JobLens job publishing surface (routers/public_jobs.py). Public —
# guest_id/user pattern, not Clerk-gated — since JobLens calls it directly.
app.include_router(public_jobs.router, prefix="/api/integrations/joblens/jobs", tags=["JobLens Integration"])
# Private ATS data — Clerk JWT verification via ats_auth.py (set ATS_AUTH_ENFORCE=true in production).
app.include_router(employees.router, prefix="/api/employees", tags=["Employees (ATS)"])
app.include_router(employee_resumes.router, prefix="/api/employees", tags=["Employee Resumes (ATS)"])
app.include_router(job_requirements.router, prefix="/api/job-requirements", tags=["Job Requirements (ATS)"])
app.include_router(job_sends.router, prefix="/api/job-sends", tags=["Job Sends (ATS)"])
app.include_router(submissions.router, prefix="/api/submissions", tags=["Submissions (ATS)"])
app.include_router(interviews.router, prefix="/api/interviews", tags=["Interviews (ATS)"])
app.include_router(offers.router, prefix="/api/offers", tags=["Offers (ATS)"])
app.include_router(crm_organizations.router, prefix="/api/crm/organizations", tags=["CRM Organizations (ATS)"])
app.include_router(crm_contacts.router, prefix="/api/crm/contacts", tags=["CRM Contacts (ATS)"])
app.include_router(crm_activities.router, prefix="/api/crm/activities", tags=["CRM Activities (ATS)"])
app.include_router(ats_dashboard.router, prefix="/api/ats", tags=["ATS Dashboard"])
app.include_router(zoho.router, prefix="/api/zoho", tags=["Zoho Mail (ATS)"])


@app.get("/", tags=["Health"])
async def root():
    return {"message": "JobLens API", "status": "running", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
