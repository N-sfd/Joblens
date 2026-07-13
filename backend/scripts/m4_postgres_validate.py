"""Phase 5 M4 — PostgreSQL environment validation helpers.

Usage (Docker Desktop must be running):
  docker compose -f docker-compose.postgres.yml up -d
  python scripts/m4_postgres_validate.py
  python scripts/m4_postgres_validate.py --create-test-db
  python scripts/m4_postgres_validate.py --migrate
  python scripts/m4_postgres_validate.py --downgrade-smoke

Does not use production credentials. Local defaults match docker-compose.postgres.yml.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

DEFAULT_URL = "postgresql://joblens:joblens@127.0.0.1:5433/joblens"
DEFAULT_TEST_URL = "postgresql://joblens:joblens@127.0.0.1:5433/joblens_test"
EXPECTED_HEAD = "i9d0e1f2a3b4"

EXPECTED_TABLES = [
    "job_requirements",
    "profiles",
    "application_answers",
    "job_applications",
    "extension_auth_challenges",
    "extension_tokens",
    "extension_diagnostics",
    "extension_fill_sessions",
    "seeker_documents",
    "application_documents",
    "extension_upload_sessions",
    "audit_logs",
]


def connect(url: str):
    from sqlalchemy import create_engine, text

    engine = create_engine(url, pool_pre_ping=True)
    with engine.connect() as conn:
        ver = conn.execute(text("SHOW server_version")).scalar()
        db = conn.execute(text("SELECT current_database()")).scalar()
        host = conn.execute(text("SHOW listen_addresses")).scalar()
        port = conn.execute(text("SHOW port")).scalar()
    return engine, {
        "postgresql_version": ver,
        "database": db,
        "listen_addresses": host,
        "port": port,
        "url_host_hint": "127.0.0.1:5433 (docker-compose host mapping)",
    }


def create_test_db(admin_url: str, test_db: str = "joblens_test") -> None:
    from sqlalchemy import create_engine, text

    # Connect to maintenance DB
    root = admin_url.rsplit("/", 1)[0] + "/postgres"
    engine = create_engine(root, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        exists = conn.execute(
            text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": test_db}
        ).scalar()
        if not exists:
            conn.execute(text(f'CREATE DATABASE "{test_db}"'))
            print(f"Created database {test_db}")
        else:
            print(f"Database {test_db} already exists")


def run_alembic(url: str, *args: str) -> int:
    env = os.environ.copy()
    env["DATABASE_URL"] = url
    cmd = [sys.executable, "-m", "alembic", *args]
    print("+", " ".join(cmd), f"(DATABASE_URL=…/{url.rsplit('/', 1)[-1]})")
    return subprocess.call(cmd, cwd=str(BACKEND), env=env)


def inspect_schema(engine) -> dict:
    from sqlalchemy import inspect, text

    insp = inspect(engine)
    tables = set(insp.get_table_names())
    missing = [t for t in EXPECTED_TABLES if t not in tables]
    details: dict = {"tables_present": sorted(tables & set(EXPECTED_TABLES)), "missing_tables": missing}

    if "job_requirements" in tables:
        cols = {c["name"]: c for c in insp.get_columns("job_requirements")}
        details["job_requirements.application_platform"] = "application_platform" in cols
        fks = insp.get_foreign_keys("job_applications") if "job_applications" in tables else []
        details["job_applications_fk_count"] = len(fks)
    if "extension_tokens" in tables:
        uq = insp.get_unique_constraints("extension_tokens")
        idxs = insp.get_indexes("extension_tokens")
        details["extension_tokens_uniques"] = [u.get("name") for u in uq]
        details["extension_tokens_indexes"] = [i.get("name") for i in idxs]
    if "extension_upload_sessions" in tables:
        cols = {c["name"]: c for c in insp.get_columns("extension_upload_sessions")}
        details["upload_session_nullable_used_at"] = cols.get("used_at", {}).get("nullable")
    with engine.connect() as conn:
        try:
            rev = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
        except Exception:
            rev = None
        details["alembic_version"] = rev
        # JSON round-trip smoke (avoid SQLAlchemy bind confusion with ::json literals)
        try:
            val = conn.execute(text("SELECT CAST(:j AS json) ->> 'a'"), {"j": '{"a":1}'}).scalar()
            details["json_works"] = val == "1"
        except Exception as exc:
            details["json_works"] = False
            details["json_error"] = str(exc)
        try:
            tz = conn.execute(text("SHOW timezone")).scalar()
            details["timezone"] = tz
        except Exception:
            details["timezone"] = None
    return details


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--database-url", default=os.getenv("DATABASE_URL", DEFAULT_URL))
    p.add_argument("--test-database-url", default=os.getenv("TEST_DATABASE_URL", DEFAULT_TEST_URL))
    p.add_argument("--create-test-db", action="store_true")
    p.add_argument("--migrate", action="store_true", help="alembic upgrade head on --database-url")
    p.add_argument("--downgrade-smoke", action="store_true", help="downgrade one then upgrade (test DB)")
    p.add_argument("--out", default=str(BACKEND.parent / "docs" / "PHASE5_M4_POSTGRES_VALIDATE.json"))
    args = p.parse_args()

    report: dict = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "expected_head": EXPECTED_HEAD,
        "backup_configuration": (
            "Local Docker volume joblens_pgdata. For production use provider "
            "automated backups (Render/Supabase/Neon). Do not use production "
            "credentials for automated tests."
        ),
    }

    try:
        engine, meta = connect(args.database_url)
        report["connectivity"] = {"ok": True, **meta}
    except Exception as exc:
        report["connectivity"] = {"ok": False, "error": str(exc)}
        print(json.dumps(report, indent=2))
        print("\nPostgreSQL unavailable. Start Docker Desktop, then:")
        print("  docker compose -f docker-compose.postgres.yml up -d")
        Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
        return 1

    if args.create_test_db:
        create_test_db(args.database_url)

    if args.migrate:
        rc = run_alembic(args.database_url, "upgrade", "head")
        report["migrate_rc"] = rc
        if rc != 0:
            Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
            return rc

    if args.downgrade_smoke:
        # Only against isolated test database
        create_test_db(args.database_url)
        run_alembic(args.test_database_url, "upgrade", "head")
        # previous revision before head
        rc1 = run_alembic(args.test_database_url, "downgrade", "h8c9d0e1f2a3")
        rc2 = run_alembic(args.test_database_url, "upgrade", "head")
        report["downgrade_smoke"] = {"downgrade_rc": rc1, "upgrade_rc": rc2}

    report["schema"] = inspect_schema(engine)
    report["head_matches"] = report["schema"].get("alembic_version") == EXPECTED_HEAD
    print(json.dumps(report, indent=2))
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nWrote {args.out}")
    return 0 if report["connectivity"].get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
