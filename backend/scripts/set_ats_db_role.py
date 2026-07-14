"""Set ATS staff role in the local database (no Clerk Backend API required).

Usage (from backend/):
  python scripts/set_ats_db_role.py admin --clerk-user-id user_2abc...
  python scripts/set_ats_db_role.py recruiter --email anila@example.com --clerk-user-id user_2abc...
  python scripts/set_ats_db_role.py read_only --clerk-user-id user_2abc...

Find your Clerk user id in the Clerk Dashboard → Users → user → User ID.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env")

from database import SessionLocal, create_tables  # noqa: E402
from models import AtsStaffUser  # noqa: E402
from ats_auth import ATS_ROLES, _normalize_role, invalidate_role_cache  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("role", choices=ATS_ROLES)
    p.add_argument("--clerk-user-id", required=True)
    p.add_argument("--email", default=None)
    p.add_argument("--name", default=None)
    p.add_argument("--organization", default="Consult America")
    args = p.parse_args()

    create_tables()
    db = SessionLocal()
    try:
        uid = args.clerk_user_id.strip()
        row = db.query(AtsStaffUser).filter(AtsStaffUser.clerk_user_id == uid).first()
        now = datetime.utcnow()
        role = _normalize_role(args.role)
        if not row:
            row = AtsStaffUser(clerk_user_id=uid)
            db.add(row)
        previous = row.role
        row.role = role
        if args.email:
            row.email = args.email.strip().lower()
        if args.name:
            row.display_name = args.name.strip()
        if args.organization:
            row.organization_name = args.organization.strip()
        row.role_updated_at = now
        row.role_updated_by = "script:set_ats_db_role"
        db.commit()
        invalidate_role_cache(uid)
        print(f"OK - {uid} role {previous!r} -> {row.role!r} email={row.email}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
