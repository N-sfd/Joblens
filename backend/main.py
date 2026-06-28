from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os

load_dotenv()

from database import create_tables
from routers import resume, jobs, match, cover_letter, auth, activity, account


@asynccontextmanager
async def lifespan(app: FastAPI):
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
app.include_router(resume.router, prefix="/api/resume", tags=["Resume"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["Jobs"])
app.include_router(match.router, prefix="/api/match", tags=["Match"])
app.include_router(cover_letter.router, prefix="/api/cover-letter", tags=["Cover Letter"])
app.include_router(activity.router, prefix="/api/activity", tags=["Activity"])
app.include_router(account.router, prefix="/api/account", tags=["Account"])


@app.get("/", tags=["Health"])
async def root():
    return {"message": "JobLens API", "status": "running", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
