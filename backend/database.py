from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import os


def _normalize_database_url(raw: str) -> str:
    """Managed Postgres providers (Render, Heroku, Supabase) often hand out
    'postgres://' URLs, but SQLAlchemy 2.x needs the 'postgresql://' driver
    prefix. Normalize so the same DATABASE_URL works everywhere."""
    url = (raw or "").strip()
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url or "sqlite:///./aijob.db"


DATABASE_URL = _normalize_database_url(os.getenv("DATABASE_URL", "sqlite:///./aijob.db"))

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=not DATABASE_URL.startswith("sqlite"),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    import models
    Base.metadata.create_all(bind=engine)
    _ensure_guest_id_column()
    _ensure_job_columns()
    _ensure_owner_columns()
    _ensure_reminder_type_column()
    _ensure_recruiter_name_email_columns()
    _ensure_ats_columns()


def _ensure_columns(table: str, columns: dict[str, str]) -> None:
    """Additively add any missing columns to an existing table.

    This mirrors the project's lightweight, no-Alembic migration approach so
    that enhancing existing tables (employees, employee_resumes, job_requirements)
    never drops or resets existing production data. `columns` maps column name to
    its SQL type fragment (portable across SQLite and PostgreSQL)."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if table not in insp.get_table_names():
        return
    existing = {c["name"] for c in insp.get_columns(table)}
    missing = {name: ddl for name, ddl in columns.items() if name not in existing}
    if not missing:
        return
    with engine.begin() as conn:
        for name, ddl in missing.items():
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def _ensure_ats_columns() -> None:
    """Add the expanded staffing CRM/ATS columns to pre-existing ATS tables."""
    _ensure_columns("employees", {
        "employee_code": "VARCHAR(50)",
        "first_name": "VARCHAR(255)",
        "middle_name": "VARCHAR(255)",
        "last_name": "VARCHAR(255)",
        "preferred_name": "VARCHAR(255)",
        "personal_email": "VARCHAR(255)",
        "company_email": "VARCHAR(255)",
        "alternate_phone": "VARCHAR(50)",
        "address_line_1": "VARCHAR(255)",
        "address_line_2": "VARCHAR(255)",
        "city": "VARCHAR(120)",
        "state": "VARCHAR(120)",
        "postal_code": "VARCHAR(30)",
        "country": "VARCHAR(120)",
        "current_location": "VARCHAR(255)",
        "willing_to_relocate": "BOOLEAN",
        "preferred_locations": "TEXT",
        "work_authorization": "VARCHAR(120)",
        "visa_expiration_date": "VARCHAR(30)",
        "sponsorship_required": "BOOLEAN",
        "employment_type": "VARCHAR(60)",
        "current_employer": "VARCHAR(255)",
        "current_job_title": "VARCHAR(255)",
        "relevant_experience_years": "VARCHAR(50)",
        "available_from": "VARCHAR(30)",
        "current_rate": "VARCHAR(100)",
        "rate_type": "VARCHAR(50)",
        "remote_preference": "VARCHAR(60)",
        "source": "VARCHAR(120)",
        "linkedin_url": "VARCHAR(500)",
        "portfolio_url": "VARCHAR(500)",
        "created_by": "VARCHAR(255)",
    })
    _ensure_columns("employee_resumes", {
        "original_filename": "VARCHAR(255)",
        "storage_provider": "VARCHAR(50)",
        "storage_path": "VARCHAR(500)",
        "parsed_industries": "TEXT",
        "parsed_data": "TEXT",
        "parsing_status": "VARCHAR(20)",
        "version_number": "INTEGER",
        "uploaded_by": "VARCHAR(255)",
    })
    _ensure_columns("job_requirements", {
        "external_job_id": "VARCHAR(100)",
        "job_reference_number": "VARCHAR(100)",
        "vendor_id": "INTEGER",
        "recruiter_contact_id": "INTEGER",
        "client_id": "INTEGER",
        "end_client_id": "INTEGER",
        "city": "VARCHAR(120)",
        "state": "VARCHAR(120)",
        "country": "VARCHAR(120)",
        "employment_type": "VARCHAR(60)",
        "contract_type": "VARCHAR(60)",
        "rate_min": "VARCHAR(50)",
        "rate_max": "VARCHAR(50)",
        "rate_currency": "VARCHAR(10)",
        "rate_type": "VARCHAR(50)",
        "clearance_requirement": "VARCHAR(255)",
        "minimum_experience": "VARCHAR(50)",
        "education_requirement": "TEXT",
        "certification_requirement": "TEXT",
        "submission_instructions": "TEXT",
        "number_of_openings": "INTEGER",
        "created_by": "VARCHAR(255)",
        "received_at": "DATETIME",
    })


def _ensure_guest_id_column():
    """Add guest_id to existing DBs (SQLite/Postgres) without a full migration tool."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "job_applications" not in insp.get_table_names():
        return
    columns = {c["name"] for c in insp.get_columns("job_applications")}
    if "guest_id" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE job_applications ADD COLUMN guest_id VARCHAR(36)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_job_applications_guest_id ON job_applications (guest_id)"))


def _ensure_job_columns():
    """Add work_type / recruiter_contact to existing DBs without a full migration tool."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "job_applications" not in insp.get_table_names():
        return
    columns = {c["name"] for c in insp.get_columns("job_applications")}
    with engine.begin() as conn:
        if "work_type" not in columns:
            conn.execute(text("ALTER TABLE job_applications ADD COLUMN work_type VARCHAR(50)"))
        if "recruiter_contact" not in columns:
            conn.execute(text("ALTER TABLE job_applications ADD COLUMN recruiter_contact VARCHAR(255)"))


def _ensure_owner_columns():
    """Add user_id (jobs, resumes) and guest_id/resume_text (resumes) to existing DBs."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    table_names = insp.get_table_names()

    if "job_applications" in table_names:
        columns = {c["name"] for c in insp.get_columns("job_applications")}
        if "user_id" not in columns:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE job_applications ADD COLUMN user_id INTEGER"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_job_applications_user_id ON job_applications (user_id)"))

    if "resume_analyses" in table_names:
        columns = {c["name"] for c in insp.get_columns("resume_analyses")}
        with engine.begin() as conn:
            if "user_id" not in columns:
                conn.execute(text("ALTER TABLE resume_analyses ADD COLUMN user_id INTEGER"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_resume_analyses_user_id ON resume_analyses (user_id)"))
            if "guest_id" not in columns:
                conn.execute(text("ALTER TABLE resume_analyses ADD COLUMN guest_id VARCHAR(36)"))
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_resume_analyses_guest_id ON resume_analyses (guest_id)"))
            if "resume_text" not in columns:
                conn.execute(text("ALTER TABLE resume_analyses ADD COLUMN resume_text TEXT"))


def _ensure_reminder_type_column():
    """Add reminder_type to existing DBs without a full migration tool."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "job_applications" not in insp.get_table_names():
        return
    columns = {c["name"] for c in insp.get_columns("job_applications")}
    if "reminder_type" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE job_applications ADD COLUMN reminder_type VARCHAR(50)"))


def _ensure_recruiter_name_email_columns():
    """Add recruiter_name / recruiter_email to existing DBs (split from the old recruiter_contact field)."""
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    if "job_applications" not in insp.get_table_names():
        return
    columns = {c["name"] for c in insp.get_columns("job_applications")}
    with engine.begin() as conn:
        if "recruiter_name" not in columns:
            conn.execute(text("ALTER TABLE job_applications ADD COLUMN recruiter_name VARCHAR(255)"))
        if "recruiter_email" not in columns:
            conn.execute(text("ALTER TABLE job_applications ADD COLUMN recruiter_email VARCHAR(255)"))
