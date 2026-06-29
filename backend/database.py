from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./aijob.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
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
