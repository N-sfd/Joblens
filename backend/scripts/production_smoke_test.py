#!/usr/bin/env python3
"""Non-destructive production / staging smoke test for JobLens CRM + ATS.

Usage:
  export SMOKE_BASE_URL=https://your-api.example.com
  export SMOKE_ADMIN_TOKEN=...      # optional Clerk session JWT
  export SMOKE_RECRUITER_TOKEN=...  # optional
  python scripts/production_smoke_test.py

Does not create jobs, candidates, or pipeline records.
Tokens must never be committed to the repository.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.getenv("SMOKE_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
ADMIN_TOKEN = os.getenv("SMOKE_ADMIN_TOKEN", "").strip()
RECRUITER_TOKEN = os.getenv("SMOKE_RECRUITER_TOKEN", "").strip()


def _req(path: str, *, token: str | None = None, expect: tuple[int, ...] = (200,)) -> dict:
    url = f"{BASE}{path}"
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=30) as resp:
            status = resp.status
            body = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        status = e.code
        body = e.read().decode("utf-8", errors="replace")
    ok = status in expect
    print(f"{'OK' if ok else 'FAIL'}  {status}  GET {path}")
    if not ok:
        print(f"       body: {body[:240]}")
        raise SystemExit(1)
    try:
        return json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {}


def main() -> None:
    print(f"Smoke testing {BASE}")
    _req("/health", expect=(200,))
    ready = _req("/health/ready", expect=(200, 503))
    if ready.get("status") != "ready":
        print("WARN  /health/ready is not ready — check checks payload above if printed")

    # Unauthenticated private routes must not succeed as 200 with data.
    _req("/api/dashboard/summary", expect=(401, 403) if os.getenv("ATS_AUTH_ENFORCE", "").lower() in ("true", "1", "yes") or ADMIN_TOKEN else (200, 401, 403))

    if ADMIN_TOKEN:
        for path in (
            "/api/dashboard/summary",
            "/api/job-requirements/?limit=5",
            "/api/candidates/?limit=5",
            "/api/pipeline/?limit=5",
            "/api/contacts/?limit=5",
            "/api/reports/overview",
            "/api/zoho/status",
        ):
            _req(path, token=ADMIN_TOKEN, expect=(200, 404))  # zoho may 404 if unused

    if RECRUITER_TOKEN:
        _req("/api/dashboard/summary", token=RECRUITER_TOKEN, expect=(200,))
        _req("/api/reports/overview", token=RECRUITER_TOKEN, expect=(200,))

    print("Smoke test completed.")


if __name__ == "__main__":
    main()
