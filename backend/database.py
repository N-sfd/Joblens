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
    import models  # noqa: F401 — registers models with Base
    Base.metadata.create_all(bind=engine)
    _ensure_guest_id_column()


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
