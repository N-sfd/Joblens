"""One-time SQLite → PostgreSQL import for Phase 5 M4 (optional).

Preserves ownership, external job IDs, recruiter links, tracker statuses,
application snapshots, reminders, profiles, approved answers, diagnostics
metadata, and document metadata.

Skips:
  - Plaintext secrets / pending challenge tokens
  - Expired auth challenges
  - Used one-time upload tokens
  - Temporary file bytes (paths only; copy files separately if needed)
  - Test fixture accounts (emails matching *@example.com / *test*)
  - Debug diagnostics with localhost URLs

Usage:
  python scripts/m4_sqlite_to_postgres.py \\
    --sqlite-url sqlite:///./aijob.db \\
    --postgres-url postgresql://joblens:joblens@127.0.0.1:5433/joblens \\
    --dry-run
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


SKIP_EMAIL_SUFFIXES = ("@example.com", "@test.com", "@localhost")


def _is_test_email(email: str | None) -> bool:
    if not email:
        return False
    e = email.lower()
    return any(e.endswith(s) for s in SKIP_EMAIL_SUFFIXES) or "test" in e.split("@")[0]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite-url", default="sqlite:///./aijob.db")
    ap.add_argument("--postgres-url", required=True)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--include-test-accounts", action="store_true")
    ap.add_argument("--out", default=str(BACKEND.parent / "docs" / "PHASE5_M4_DATA_MIGRATION_REPORT.json"))
    args = ap.parse_args()

    src_engine = create_engine(
        args.sqlite_url,
        connect_args={"check_same_thread": False} if args.sqlite_url.startswith("sqlite") else {},
    )
    dst_engine = create_engine(args.postgres_url, pool_pre_ping=True)
    Src = sessionmaker(bind=src_engine)
    Dst = sessionmaker(bind=dst_engine)

    from models import (
        User,
        Profile,
        ApplicationAnswer,
        JobApplication,
        JobRequirement,
        ExtensionDiagnostic,
        SeekerDocument,
        ApplicationDocument,
        ExtensionAuthChallenge,
        ExtensionToken,
        ExtensionUploadSession,
    )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "imported": {},
        "skipped": {},
        "notes": [],
    }

    src = Src()
    dst = Dst()
    try:
        users = src.query(User).all()
        imported_users = 0
        skipped_users = 0
        user_id_map: dict[int, int] = {}
        for u in users:
            if not args.include_test_accounts and _is_test_email(u.email):
                skipped_users += 1
                continue
            existing = dst.query(User).filter(User.email == u.email).first()
            if existing:
                user_id_map[u.id] = existing.id
                continue
            if args.dry_run:
                imported_users += 1
                continue
            nu = User(
                email=u.email,
                password_hash=u.password_hash,
                name=u.name,
                created_at=u.created_at,
            )
            dst.add(nu)
            dst.flush()
            user_id_map[u.id] = nu.id
            imported_users += 1
        report["imported"]["users"] = imported_users
        report["skipped"]["test_users"] = skipped_users

        # Profiles / answers — only for mapped users
        for model, key in ((Profile, "profiles"), (ApplicationAnswer, "application_answers")):
            count = 0
            for row in src.query(model).all():
                uid = getattr(row, "user_id", None)
                if uid is not None and uid not in user_id_map:
                    continue
                if args.dry_run:
                    count += 1
                    continue
                # Shallow copy via dict excluding PK
                data = {c.name: getattr(row, c.name) for c in row.__table__.columns if c.name != "id"}
                if "user_id" in data and data["user_id"] is not None:
                    data["user_id"] = user_id_map.get(data["user_id"], data["user_id"])
                dst.add(model(**data))
                count += 1
            report["imported"][key] = count

        # Job requirements (CRM) — preserve external ids when present
        jr_count = 0
        for jr in src.query(JobRequirement).all():
            if args.dry_run:
                jr_count += 1
                continue
            data = {c.name: getattr(jr, c.name) for c in jr.__table__.columns if c.name != "id"}
            dst.add(JobRequirement(**data))
            jr_count += 1
        report["imported"]["job_requirements"] = jr_count

        # Tracker applications
        app_count = 0
        for app in src.query(JobApplication).all():
            if app.user_id is not None and app.user_id not in user_id_map and not args.include_test_accounts:
                continue
            if args.dry_run:
                app_count += 1
                continue
            data = {c.name: getattr(app, c.name) for c in app.__table__.columns if c.name != "id"}
            if data.get("user_id") is not None:
                data["user_id"] = user_id_map.get(data["user_id"], data["user_id"])
            dst.add(JobApplication(**data))
            app_count += 1
        report["imported"]["job_applications"] = app_count

        # Diagnostics — skip localhost debug URLs
        diag_ok = diag_skip = 0
        for d in src.query(ExtensionDiagnostic).all():
            url = (d.application_url_normalized or "") + (d.employer or "")
            if "localhost" in url or "127.0.0.1" in url:
                diag_skip += 1
                continue
            if args.dry_run:
                diag_ok += 1
                continue
            data = {c.name: getattr(d, c.name) for c in d.__table__.columns if c.name != "id"}
            if data.get("user_id") is not None:
                data["user_id"] = user_id_map.get(data["user_id"], data["user_id"])
            dst.add(ExtensionDiagnostic(**data))
            diag_ok += 1
        report["imported"]["extension_diagnostics"] = diag_ok
        report["skipped"]["localhost_diagnostics"] = diag_skip

        # Documents metadata only
        for model, key in ((SeekerDocument, "seeker_documents"), (ApplicationDocument, "application_documents")):
            count = 0
            for row in src.query(model).all():
                if args.dry_run:
                    count += 1
                    continue
                data = {c.name: getattr(row, c.name) for c in row.__table__.columns if c.name != "id"}
                if data.get("user_id") is not None:
                    data["user_id"] = user_id_map.get(data["user_id"], data["user_id"])
                dst.add(model(**data))
                count += 1
            report["imported"][key] = count

        # Never import live extension tokens / pending challenges / used upload tokens
        report["skipped"]["extension_tokens"] = src.query(ExtensionToken).count()
        report["skipped"]["extension_auth_challenges"] = src.query(ExtensionAuthChallenge).count()
        report["skipped"]["extension_upload_sessions"] = src.query(ExtensionUploadSession).count()
        report["notes"].append(
            "Extension tokens, auth challenges, and upload sessions were not imported. "
            "Users must reconnect the extension. Copy seeker document files separately "
            "if storage paths differ."
        )

        if not args.dry_run:
            dst.commit()
        else:
            dst.rollback()

    except Exception as exc:
        dst.rollback()
        report["error"] = str(exc)
        print(json.dumps(report, indent=2))
        Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
        return 1
    finally:
        src.close()
        dst.close()

    print(json.dumps(report, indent=2))
    Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
