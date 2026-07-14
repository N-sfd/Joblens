"""Shared pytest fixtures — isolated in-memory SQLite per test."""

import os

# Force test env before database/engine or main lifespan is imported.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ENV"] = "test"
os.environ["ATS_AUTH_ENFORCE"] = "false"
os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("EXTENSION_JWT_SECRET", "test-secret-key")
os.environ.setdefault("EXTENSION_TOKEN_ISSUER", "joblens-extension")
os.environ.setdefault("EXTENSION_TOKEN_AUDIENCE", "joblens-extension-api")
os.environ.setdefault("EXTENSION_MIN_VERSION", "0.3.0")
os.environ.setdefault("STORAGE_PROVIDER", "local")
os.environ.setdefault("EXTENSION_ENABLED", "true")
os.environ.setdefault("EXTENSION_ASSISTED_FILL_ENABLED", "true")
os.environ.setdefault("EXTENSION_DOCUMENT_UPLOAD_ENABLED", "true")
os.environ.setdefault("EXTENSION_DIAGNOSTICS_ENABLED", "true")
os.environ.setdefault("EXTENSION_SUBMISSION_CONFIRMATION_ENABLED", "true")
os.environ.setdefault("EXTENSION_GREENHOUSE_ENABLED", "true")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from auth import hash_password, create_access_token, COOKIE_NAME
from models import User
import models  # noqa: F401 — register all ORM tables
from main import app

# main.py's load_dotenv(override=True) can re-load a local backend/.env with
# ATS_AUTH_ENFORCE=true (e.g. from real Clerk testing) after the block above
# already set it to "false" — since ats_auth.ENFORCE is a module-level
# constant baked in at first import, force it back to the test default here.
import ats_auth as _ats_auth

_ats_auth.ENFORCE = False


@pytest.fixture(autouse=True)
def _clear_rate_limits():
    from services import rate_limit as rl

    with rl._lock:
        rl._hits.clear()
    yield
    with rl._lock:
        rl._hits.clear()


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(db_session):
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def guest_headers():
    return {"X-Guest-Id": "guest-test-aaaa-bbbb-cccc-ddddeeee"}


@pytest.fixture()
def other_guest_headers():
    return {"X-Guest-Id": "guest-other-1111-2222-3333-44445555"}


@pytest.fixture()
def auth_user(db_session):
    user = User(
        email="seeker@example.com",
        password_hash=hash_password("password123"),
        name="Test Seeker",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def auth_client(client, auth_user):
    token = create_access_token(auth_user.id)
    client.cookies.set(COOKIE_NAME, token)
    return client


def make_published_job(db, **overrides):
    """Insert a Discover Jobs–visible JobRequirement."""
    from models import JobRequirement

    defaults = {
        "job_title": "Senior Backend Engineer",
        "client": "Acme Corp",
        "vendor": "Staffing Co",
        "location": "Remote",
        "work_type": "Remote",
        "rate": "$80/hr",
        "job_description": "Build APIs.",
        "application_url": "https://jobs.example.com/apply/123",
        "recruiter_name": "Pat Recruiter",
        "recruiter_email": "pat@staffing.example",
        "status": "Open",
        "review_status": "Approved",
        "published_for_matching": True,
        "source": "Manual",
    }
    defaults.update(overrides)
    job = JobRequirement(**defaults)
    db.add(job)
    db.commit()
    db.refresh(job)
    return job
