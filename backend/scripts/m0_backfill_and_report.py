"""Backfill application_platform and print M0 platform report.

Usage:
  python scripts/m0_backfill_and_report.py
  python scripts/m0_backfill_and_report.py --database-url postgresql://joblens:joblens@127.0.0.1:5433/joblens
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter
from pathlib import Path

# Allow `python scripts/m0_...` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from services.application_url import (
    normalize_application_url,
    classify_platform,
    PLATFORM_RECRUITER_EMAIL,
    PLATFORM_UNKNOWN,
)


def _engine(url: str):
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args)


def ensure_column(engine):
    from sqlalchemy import inspect
    insp = inspect(engine)
    tables = insp.get_table_names()
    with engine.begin() as conn:
        if "job_requirements" in tables:
            cols = {c["name"] for c in insp.get_columns("job_requirements")}
            if "application_platform" not in cols:
                conn.execute(text("ALTER TABLE job_requirements ADD COLUMN application_platform VARCHAR(50)"))
        if "job_applications" in tables:
            cols = {c["name"] for c in insp.get_columns("job_applications")}
            for name, ddl in {
                "archived_at": "DATETIME",
                "status_changed_at": "DATETIME",
                "status_changed_by": "VARCHAR(50)",
                "action_required": "BOOLEAN",
                "action_required_reason": "VARCHAR(255)",
                "last_user_activity_at": "DATETIME",
                "reminder_completed_at": "DATETIME",
                "job_snapshot_json": "TEXT",
                "application_source": "VARCHAR(50)",
                "application_method": "VARCHAR(30)",
                "application_opened_at": "DATETIME",
                "applied_at": "DATETIME",
                "recruiter_contacted_at": "DATETIME",
                "last_activity_at": "DATETIME",
            }.items():
                if name not in cols:
                    conn.execute(text(f"ALTER TABLE job_applications ADD COLUMN {name} {ddl}"))


def backfill(session) -> dict:
    from models import JobRequirement, JobApplication

    updated = 0
    unchanged = 0
    for job in session.query(JobRequirement).all():
        classified = normalize_application_url(job.application_url)
        if classified.is_valid and classified.normalized_url:
            new_url = classified.normalized_url
            new_plat = classified.platform
        elif job.recruiter_email and str(job.recruiter_email).strip() and not (job.application_url or "").strip():
            new_url = job.application_url
            new_plat = PLATFORM_RECRUITER_EMAIL
        else:
            new_url = job.application_url
            new_plat = classified.platform if job.application_url else (
                PLATFORM_RECRUITER_EMAIL if job.recruiter_email else PLATFORM_UNKNOWN
            )

        changed = False
        if new_url and new_url != job.application_url:
            job.application_url = new_url
            changed = True
        if getattr(job, "application_platform", None) != new_plat:
            job.application_platform = new_plat
            changed = True
        if changed:
            updated += 1
        else:
            unchanged += 1

    session.commit()
    # Idempotent second pass should update 0
    second = 0
    for job in session.query(JobRequirement).all():
        classified = normalize_application_url(job.application_url)
        plat = classified.platform if classified.is_valid else (
            PLATFORM_RECRUITER_EMAIL if job.recruiter_email and not (job.application_url or "").strip()
            else (job.application_platform or PLATFORM_UNKNOWN)
        )
        if classified.is_valid and classified.normalized_url and classified.normalized_url != job.application_url:
            second += 1
        elif plat != job.application_platform:
            second += 1
    return {"updated": updated, "unchanged": unchanged, "second_pass_changes": second}


def report(session) -> dict:
    from models import JobRequirement, JobApplication

    rows = session.query(JobRequirement).all()
    total = len(rows)
    with_url = 0
    recruiter_only = 0
    neither = 0
    invalid = 0
    unknown = 0
    by_platform = Counter()
    lost = 0  # URL in raw/description text but missing on application_url

    for job in rows:
        has_u = bool(job.application_url and str(job.application_url).strip())
        has_e = bool(job.recruiter_email and str(job.recruiter_email).strip())
        plat = job.application_platform or classify_platform(
            job.application_url,
            has_recruiter_email=has_e,
            has_application_url=has_u,
        )
        by_platform[plat] += 1
        if has_u:
            with_url += 1
            c = normalize_application_url(job.application_url)
            if not c.is_valid:
                invalid += 1
            if plat == PLATFORM_UNKNOWN:
                unknown += 1
        elif has_e:
            recruiter_only += 1
        else:
            neither += 1

        # Loss detection: greenhouse/lever-like URL in text but not stored
        blob = " ".join(filter(None, [
            job.job_description, job.raw_email_text, job.submission_instructions, job.notes,
        ]))
        if blob and not has_u:
            from services.application_url import prefer_application_url_from_parse
            recovered = prefer_application_url_from_parse(None, blob)
            if recovered.is_valid and recovered.platform not in (PLATFORM_UNKNOWN, PLATFORM_RECRUITER_EMAIL):
                lost += 1

    # Tracker URLs
    tracker_platforms = Counter()
    for app in session.query(JobApplication).all():
        u = app.job_url
        if not u and app.job_snapshot_json:
            try:
                snap = json.loads(app.job_snapshot_json)
                u = snap.get("application_url")
            except Exception:
                u = None
        if u:
            tracker_platforms[normalize_application_url(u).platform] += 1

    return {
        "total_jobs": total,
        "jobs_with_application_urls": with_url,
        "recruiter_contact_only": recruiter_only,
        "neither_url_nor_recruiter": neither,
        "invalid_urls": invalid,
        "unknown_platform_with_url": unknown,
        "urls_lost_between_source_and_field": lost,
        "counts_by_platform": dict(by_platform.most_common()),
        "tracker_url_platforms": dict(tracker_platforms.most_common()),
    }


def run_one(url: str, *, skip_backfill: bool = False) -> dict:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    try:
        engine = _engine(url)
        # Probe connectivity early so Postgres-down soft-fails cleanly.
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        ensure_column(engine)
        Session = sessionmaker(bind=engine)
        session = Session()
        try:
            backfill_result = {"skipped": True}
            if not skip_backfill:
                backfill_result = backfill(session)
            rep = report(session)
            return {
                "available": True,
                "database_url_scheme": url.split("://", 1)[0],
                "backfill": backfill_result,
                "report": rep,
            }
        finally:
            session.close()
    except Exception as exc:
        return {
            "available": False,
            "database_url_scheme": url.split("://", 1)[0] if "://" in url else "unknown",
            "error": f"{type(exc).__name__}: {exc}",
            "report": None,
            "backfill": None,
        }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--database-url",
        default=None,
        help="Single database URL. If omitted, runs SQLite then optional Postgres.",
    )
    parser.add_argument(
        "--postgres-url",
        default=os.getenv(
            "POSTGRES_URL",
            "postgresql://joblens:joblens@127.0.0.1:5433/joblens",
        ),
    )
    parser.add_argument("--skip-backfill", action="store_true")
    parser.add_argument("--skip-postgres", action="store_true")
    args = parser.parse_args()

    if args.database_url:
        print(json.dumps(run_one(args.database_url, skip_backfill=args.skip_backfill), indent=2))
        return

    sqlite_url = os.getenv("DATABASE_URL", "sqlite:///./aijob.db")
    if not sqlite_url.startswith("sqlite"):
        # Prefer explicit local SQLite for M0 dual report when DATABASE_URL is Postgres.
        sqlite_url = "sqlite:///./aijob.db"

    out = {
        "sqlite": run_one(sqlite_url, skip_backfill=args.skip_backfill),
        "postgresql": None,
    }
    if not args.skip_postgres:
        out["postgresql"] = run_one(args.postgres_url, skip_backfill=args.skip_backfill)
    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    main()
