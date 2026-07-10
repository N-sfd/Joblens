"""Copy data from local SQLite (aijob.db) into Postgres.

Usage (from backend/):
  # Ensure DATABASE_URL points at Postgres, then:
  python scripts/migrate_sqlite_to_postgres.py
  python scripts/migrate_sqlite_to_postgres.py --sqlite ./aijob.db --truncate

Does NOT copy alembic_version (Postgres should already be at head via alembic upgrade).
Resets Postgres sequences after insert so new IDs continue correctly.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

sys.path.insert(0, str(ROOT))

from sqlalchemy import create_engine, text  # noqa: E402
from database import DATABASE_URL, _normalize_database_url  # noqa: E402

# Parent tables first (FK-safe order).
TABLES = [
    "users",
    "profiles",
    "employees",
    "employee_resumes",
    "crm_organizations",
    "crm_contacts",
    "job_requirements",
    "job_applications",
    "job_matches",
    "cover_letters",
    "resume_analyses",
    "ai_activities",
    "crm_activities",
    "zoho_connections",
    "zoho_oauth_states",
    "imported_emails",
    "job_employee_sends",
    "submissions",
    "interviews",
    "offers",
    "audit_logs",
]


def _quote_ident(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def migrate(sqlite_path: Path, truncate: bool) -> None:
    if not sqlite_path.exists():
        raise SystemExit(f"SQLite file not found: {sqlite_path}")

    pg_url = _normalize_database_url(DATABASE_URL)
    if not pg_url.startswith("postgresql"):
        raise SystemExit(
            f"DATABASE_URL must be Postgres for this migration (got {pg_url!r}).\n"
            "Set DATABASE_URL=postgresql://joblens:joblens@127.0.0.1:5433/joblens in .env"
        )

    src = sqlite3.connect(str(sqlite_path))
    src.row_factory = sqlite3.Row
    engine = create_engine(pg_url)

    print(f"Source: {sqlite_path}")
    print(f"Target: {pg_url.split('@')[-1]}")

    with engine.begin() as conn:
        if truncate:
            # Reverse order for FK safety.
            for table in reversed(TABLES):
                exists = conn.execute(
                    text(
                        "SELECT 1 FROM information_schema.tables "
                        "WHERE table_schema='public' AND table_name=:t"
                    ),
                    {"t": table},
                ).fetchone()
                if exists:
                    conn.execute(text(f"TRUNCATE TABLE {_quote_ident(table)} RESTART IDENTITY CASCADE"))
            print("Truncated target tables.")

        totals: dict[str, int] = {}
        for table in TABLES:
            src_tables = {
                r[0]
                for r in src.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                )
            }
            if table not in src_tables:
                print(f"  skip {table} (not in SQLite)")
                continue

            pg_exists = conn.execute(
                text(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema='public' AND table_name=:t"
                ),
                {"t": table},
            ).fetchone()
            if not pg_exists:
                print(f"  skip {table} (not in Postgres)")
                continue

            rows = src.execute(f'SELECT * FROM "{table}"').fetchall()
            if not rows:
                print(f"  {table}: 0 rows")
                totals[table] = 0
                continue

            cols = [k for k in rows[0].keys()]
            col_list = ", ".join(_quote_ident(c) for c in cols)
            placeholders = ", ".join(f":{c}" for c in cols)
            # ON CONFLICT DO NOTHING keeps re-runs safe when PKs already exist.
            pk_cols = conn.execute(
                text(
                    "SELECT kcu.column_name FROM information_schema.table_constraints tc "
                    "JOIN information_schema.key_column_usage kcu "
                    "  ON tc.constraint_name = kcu.constraint_name "
                    " AND tc.table_schema = kcu.table_schema "
                    "WHERE tc.table_schema = 'public' AND tc.table_name = :t "
                    "  AND tc.constraint_type = 'PRIMARY KEY' "
                    "ORDER BY kcu.ordinal_position"
                ),
                {"t": table},
            ).fetchall()
            conflict = ""
            if pk_cols:
                pk = ", ".join(_quote_ident(r[0]) for r in pk_cols)
                conflict = f" ON CONFLICT ({pk}) DO NOTHING"

            # SQLite stores booleans as 0/1 — cast to bool for Postgres.
            bool_cols = {
                r[0]
                for r in conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_schema='public' AND table_name=:t "
                        "AND data_type = 'boolean'"
                    ),
                    {"t": table},
                ).fetchall()
            }

            insert_sql = text(
                f"INSERT INTO {_quote_ident(table)} ({col_list}) VALUES ({placeholders}){conflict}"
            )
            inserted = 0
            for row in rows:
                payload = {c: row[c] for c in cols}
                for c in bool_cols:
                    if c in payload and payload[c] is not None:
                        payload[c] = bool(payload[c])
                result = conn.execute(insert_sql, payload)
                inserted += result.rowcount or 0

            # Reset serial sequence to max(id) when an id column exists.
            if "id" in cols:
                conn.execute(
                    text(
                        f"SELECT setval(pg_get_serial_sequence(:t, 'id'), "
                        f"COALESCE((SELECT MAX(id) FROM {_quote_ident(table)}), 1))"
                    ),
                    {"t": table},
                )

            totals[table] = inserted
            print(f"  {table}: {inserted}/{len(rows)} inserted")

    src.close()
    print("Done.")
    print("Summary:", {k: v for k, v in totals.items() if v})


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate SQLite → Postgres")
    parser.add_argument(
        "--sqlite",
        default=str(ROOT / "aijob.db"),
        help="Path to source SQLite file",
    )
    parser.add_argument(
        "--truncate",
        action="store_true",
        help="Truncate Postgres tables before import (destructive on target)",
    )
    args = parser.parse_args()
    migrate(Path(args.sqlite), truncate=args.truncate)


if __name__ == "__main__":
    main()
