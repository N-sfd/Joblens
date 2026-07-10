"""One-shot: set Clerk public_metadata.role for ATS RBAC.

Usage (from backend/):
  python scripts/set_clerk_role.py admin
  python scripts/set_clerk_role.py recruiter --user-id user_xxx
  python scripts/set_clerk_role.py viewer --email hr@consultamerica.com

Requires CLERK_SECRET_KEY in backend/.env (or environment).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

ATS_ROLES = ("admin", "recruiter", "viewer")
API = "https://api.clerk.com/v1"


def _request(method: str, path: str, body: dict | None = None) -> dict:
    secret = os.getenv("CLERK_SECRET_KEY", "").strip()
    if not secret:
        raise SystemExit("CLERK_SECRET_KEY is not set in backend/.env")
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Clerk API {e.code}: {detail}") from e


def _find_user(user_id: str | None, email: str | None) -> dict:
    if user_id:
        return _request("GET", f"/users/{user_id}")
    users = _request("GET", f"/users?limit=50")
    items = users if isinstance(users, list) else users.get("data") or users.get("value") or []
    if email:
        target = email.strip().lower()
        for u in items:
            emails = [e.get("email_address", "").lower() for e in (u.get("email_addresses") or [])]
            if target in emails:
                return u
        raise SystemExit(f"No Clerk user found with email {email}")
    if len(items) == 1:
        return items[0]
    raise SystemExit("Multiple Clerk users found — pass --user-id or --email")


def main() -> None:
    parser = argparse.ArgumentParser(description="Set Clerk public_metadata.role")
    parser.add_argument("role", choices=ATS_ROLES)
    parser.add_argument("--user-id", default=None)
    parser.add_argument("--email", default=None)
    args = parser.parse_args()

    user = _find_user(args.user_id, args.email)
    uid = user["id"]
    updated = _request("PATCH", f"/users/{uid}/metadata", {"public_metadata": {"role": args.role}})
    role = (updated.get("public_metadata") or {}).get("role")
    name = " ".join(p for p in [user.get("first_name"), user.get("last_name")] if p).strip() or uid
    print(f"OK — {name} ({uid}) public_metadata.role = {role}")


if __name__ == "__main__":
    main()
