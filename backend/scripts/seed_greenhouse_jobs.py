"""Seed Approved + published Greenhouse jobs from fixture sample_*.json files.

Idempotent on normalized application_url. Does not bypass ATS auth for HTTP —
this is a local/ops inventory seed for pilot readiness.

Usage (from backend/):
  python scripts/seed_greenhouse_jobs.py
  python scripts/seed_greenhouse_jobs.py --database-url postgresql://joblens:joblens@127.0.0.1:5433/joblens
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env")

FIXTURES = BACKEND / "fixtures" / "greenhouse"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--database-url",
        default=os.getenv("DATABASE_URL", "sqlite:///./aijob.db"),
    )
    ap.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max fixtures to seed (0 = all sample_*.json)",
    )
    args = ap.parse_args()

    url = args.database_url
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    os.environ["DATABASE_URL"] = url

    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    from database import create_tables
    from models import JobRequirement
    from services.application_url import (
        PLATFORM_GREENHOUSE,
        normalize_application_url,
    )

    create_tables()
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(
        url,
        connect_args=connect_args,
        pool_pre_ping=not url.startswith("sqlite"),
    )
    Session = sessionmaker(bind=engine)
    db = Session()

    samples = sorted(FIXTURES.glob("sample_*.json"))
    if args.limit > 0:
        samples = samples[: args.limit]
    if not samples:
        print(f"No fixtures in {FIXTURES}")
        return 1

    created = 0
    skipped = 0
    try:
        for path in samples:
            data = json.loads(path.read_text(encoding="utf-8"))
            absolute = (data.get("absolute_url") or "").strip()
            if not absolute:
                print(f"SKIP {path.name} — no absolute_url")
                skipped += 1
                continue
            classified = normalize_application_url(absolute)
            if classified.platform != PLATFORM_GREENHOUSE or not classified.normalized_url:
                print(f"SKIP {path.name} — not greenhouse ({classified.platform})")
                skipped += 1
                continue

            existing = (
                db.query(JobRequirement)
                .filter(JobRequirement.application_url == classified.normalized_url)
                .first()
            )
            if not existing:
                # Also match raw absolute_url variants
                existing = (
                    db.query(JobRequirement)
                    .filter(JobRequirement.application_url == absolute)
                    .first()
                )

            loc = data.get("location") or {}
            loc_name = loc.get("name") if isinstance(loc, dict) else str(loc or "")
            board = data.get("board") or "greenhouse"
            title = data.get("title") or f"Greenhouse job {data.get('id')}"
            external_id = str(data.get("id") or path.stem)

            if existing:
                existing.application_url = classified.normalized_url
                existing.application_platform = PLATFORM_GREENHOUSE
                existing.review_status = "Approved"
                existing.published_for_matching = True
                if existing.status in (
                    "Closed",
                    "Rejected",
                    "Duplicate",
                    "Spam",
                    "On Hold",
                ):
                    existing.status = "Ready for Match"
                if not existing.job_title:
                    existing.job_title = title
                skipped += 1
                print(f"UPDATE id={existing.id} {title} <- {path.name}")
            else:
                job = JobRequirement(
                    external_job_id=f"gh-{board}-{external_id}",
                    job_title=title,
                    client=board.title() if board != "public" else "Public Demo Board",
                    vendor="Greenhouse fixture seed",
                    location=loc_name or "See listing",
                    work_type="Unknown",
                    job_description=(
                        f"Seeded from {path.name} for Phase 5 Greenhouse pilot. "
                        f"Apply on employer site: {classified.normalized_url}"
                    ),
                    application_url=classified.normalized_url,
                    application_platform=PLATFORM_GREENHOUSE,
                    required_skills=json.dumps([]),
                    status="Ready for Match",
                    review_status="Approved",
                    published_for_matching=True,
                    source="Greenhouse fixture seed",
                    notes=f"Fixture board={board} id={external_id}",
                    created_by="script:seed_greenhouse_jobs",
                )
                db.add(job)
                created += 1
                print(f"CREATE {title} <- {path.name}")

        db.commit()

        total = db.query(JobRequirement).count()
        gh = (
            db.query(JobRequirement)
            .filter(JobRequirement.application_platform == PLATFORM_GREENHOUSE)
            .count()
        )
        published = (
            db.query(JobRequirement)
            .filter(
                JobRequirement.published_for_matching.is_(True),
                JobRequirement.review_status == "Approved",
                JobRequirement.application_platform == PLATFORM_GREENHOUSE,
            )
            .count()
        )
        print(
            json.dumps(
                {
                    "created": created,
                    "updated_or_skipped": skipped,
                    "job_requirements_total": total,
                    "greenhouse_total": gh,
                    "greenhouse_published_approved": published,
                },
                indent=2,
            )
        )
        return 0 if published > 0 else 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
