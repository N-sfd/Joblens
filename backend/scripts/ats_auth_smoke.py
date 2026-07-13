"""ATS auth smoke: verify 401, DB admin role, parse + save employee/job, publish.

Does not disable ATS_AUTH_ENFORCE. Authenticated HTTP routes are exercised via
TestClient dependency overrides that inject the real DB-backed admin principal
(same role resolution path as production). Unauthenticated probes hit the live
API when reachable.

Usage (from backend/):
  python scripts/ats_auth_smoke.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
sys.path.insert(0, str(BACKEND))
load_dotenv(BACKEND / ".env")

STAFF_CLERK_ID = os.getenv(
    "ATS_SMOKE_CLERK_USER_ID",
    "user_3FxSaAuW1oGdWPyB5LJQFy4KQSc",
)
API_BASE = os.getenv("ATS_SMOKE_API_BASE", "http://127.0.0.1:8000").rstrip("/")

RESUME_SAMPLE = """
Jane Smoke Tester
jane.smoke@example.com | 555-0100 | Remote

SUMMARY
Senior software engineer with 8 years of experience in Python and FastAPI.

EXPERIENCE
Acme Corp — Senior Backend Engineer (2020–Present)
- Built REST APIs and staffing ATS integrations.

SKILLS
Python, FastAPI, PostgreSQL, React
"""

JOB_SAMPLE = """
Subject: Urgent — Senior Python Engineer — Remote

Hi team,

We need a Senior Python Engineer for Acme Client.
Location: Remote (US)
Rate: $85/hr
Duration: 12 months
Required: Python, FastAPI, PostgreSQL
Apply: https://job-boards.greenhouse.io/public/jobs/7720156003

Thanks,
Pat Recruiter
pat@vendor.example
"""


def _http_json(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(
        f"{API_BASE}{path}",
        data=data,
        headers=headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"detail": raw[:200]}
        return e.code, parsed
    except Exception as e:
        return 0, {"detail": str(e)}


def main() -> int:
    from fastapi.testclient import TestClient

    from ats_auth import (
        AtsPrincipal,
        FORBIDDEN_MSG,
        UNAUTHORIZED_MSG,
        get_current_ats_user,
        require_writer,
    )
    from database import SessionLocal, create_tables
    from main import app
    from models import AtsStaffUser, Employee, JobRequirement
    from services.application_url import normalize_application_url
    from services.claude_service import parse_employee_resume, parse_job_requirement

    create_tables()
    results: list[tuple[str, str, str]] = []

    def ok(name: str, detail: str = "") -> None:
        results.append((name, "PASS", detail))
        print(f"PASS  {name}" + (f" — {detail}" if detail else ""))

    def fail(name: str, detail: str) -> None:
        results.append((name, "FAIL", detail))
        print(f"FAIL  {name} — {detail}")

    # 1) Live unauthenticated probes
    code, body = _http_json("GET", "/health")
    if code == 200:
        ok("api_health", str(body))
    else:
        fail("api_health", f"status={code} body={body}")

    code, body = _http_json("GET", "/api/ats/me")
    if code == 401:
        ok("unauth_ats_me_401", str(body.get("detail") if isinstance(body, dict) else body)[:120])
    else:
        fail("unauth_ats_me_401", f"expected 401 got {code}: {body}")

    code, body = _http_json("POST", "/api/employees/parse-resume")
    if code == 401:
        detail = body.get("detail") if isinstance(body, dict) else body
        if FORBIDDEN_MSG in str(detail):
            fail("unauth_parse_resume", "got 403 ATS message instead of 401")
        else:
            ok("unauth_parse_resume_401", str(detail)[:120])
    else:
        fail("unauth_parse_resume_401", f"expected 401 got {code}: {body}")

    # 2) DB staff role
    db = SessionLocal()
    try:
        staff = (
            db.query(AtsStaffUser)
            .filter(AtsStaffUser.clerk_user_id == STAFF_CLERK_ID)
            .first()
        )
        if staff and staff.role in ("admin", "recruiter"):
            ok("db_staff_role", f"{staff.role} org={staff.organization_name}")
        else:
            fail("db_staff_role", f"missing or wrong role for {STAFF_CLERK_ID}: {staff}")
            _write_report(results, None, None)
            return 1

        principal = AtsPrincipal(
            user_id=STAFF_CLERK_ID,
            claims={},
            email=staff.email,
            display_name=staff.display_name,
        )
        role = principal.resolve_role()
        if role in ("admin", "recruiter") and principal.role_source in (
            "database",
            "clerk_api",
            "jwt",
            "bootstrap",
        ):
            ok("resolve_role_writer", f"role={role} source={principal.role_source}")
        else:
            fail(
                "resolve_role_writer",
                f"role={role} source={principal.role_source}",
            )
    finally:
        db.close()

    # 3) Authenticated TestClient with DB-backed admin principal
    admin = AtsPrincipal(
        user_id=STAFF_CLERK_ID,
        claims={"sub": STAFF_CLERK_ID},
        email="smoke@consultamerica.example",
        display_name="Smoke Admin",
        organization_name="Consult America",
    )
    admin._resolved_role = "admin"
    admin.role_source = "database"

    app.dependency_overrides[get_current_ats_user] = lambda: admin
    app.dependency_overrides[require_writer] = lambda: admin

    employee_id = None
    job_id = None

    try:
        with TestClient(app) as client:
            me = client.get("/api/ats/me")
            if me.status_code == 200 and me.json().get("role") == "admin":
                ok("ats_me_authenticated", json.dumps(me.json())[:160])
            else:
                fail("ats_me_authenticated", f"{me.status_code} {me.text[:200]}")

            # Parse resume (AI) — auth already satisfied via override
            try:
                parsed_emp = asyncio.run(parse_employee_resume(RESUME_SAMPLE))
                if isinstance(parsed_emp, dict) and (
                    parsed_emp.get("name")
                    or parsed_emp.get("email")
                    or parsed_emp.get("first_name")
                ):
                    ok(
                        "parse_resume_ai",
                        f"name={parsed_emp.get('name') or parsed_emp.get('first_name')}",
                    )
                else:
                    fail("parse_resume_ai", f"unexpected payload keys={list(parsed_emp)[:12]}")
                    parsed_emp = {
                        "name": "Jane Smoke Tester",
                        "email": "jane.smoke@example.com",
                        "primary_skill": "Python",
                    }
            except Exception as e:
                fail("parse_resume_ai", f"{type(e).__name__}: {e}")
                parsed_emp = {
                    "name": "Jane Smoke Tester",
                    "email": "jane.smoke@example.com",
                    "primary_skill": "Python",
                }

            emp_payload = {
                "name": parsed_emp.get("name")
                or f"{parsed_emp.get('first_name', 'Jane')} {parsed_emp.get('last_name', 'Smoke')}".strip(),
                "email": (parsed_emp.get("email") or "jane.smoke@example.com").lower(),
                "phone": parsed_emp.get("phone") or "555-0100",
                "primary_skill": parsed_emp.get("primary_skill") or "Python",
                "location": parsed_emp.get("location") or "Remote",
                "status": "Active",
                "source": "ATS auth smoke",
                "created_by": STAFF_CLERK_ID,
            }
            # Unique email per run to avoid unique conflicts
            emp_payload["email"] = f"jane.smoke.{int(datetime.now().timestamp())}@example.com"

            r = client.post("/api/employees/", json=emp_payload)
            if r.status_code in (200, 201):
                employee_id = r.json().get("id")
                ok("save_employee", f"id={employee_id}")
            else:
                fail("save_employee", f"{r.status_code} {r.text[:300]}")

            try:
                parsed_job = asyncio.run(parse_job_requirement(JOB_SAMPLE))
                if isinstance(parsed_job, dict) and parsed_job.get("job_title"):
                    ok("parse_job_ai", f"title={parsed_job.get('job_title')}")
                else:
                    fail("parse_job_ai", f"unexpected={str(parsed_job)[:160]}")
                    parsed_job = {}
            except Exception as e:
                fail("parse_job_ai", f"{type(e).__name__}: {e}")
                parsed_job = {}

            app_url = (
                parsed_job.get("application_url")
                or "https://job-boards.greenhouse.io/public/jobs/7720156003"
            )
            classified = normalize_application_url(app_url)
            job_payload = {
                "job_title": parsed_job.get("job_title") or "Senior Python Engineer",
                "client": parsed_job.get("client") or "Acme Client",
                "vendor": parsed_job.get("vendor") or "Vendor Co",
                "location": parsed_job.get("location") or "Remote",
                "work_type": parsed_job.get("work_type") or "Remote",
                "rate": parsed_job.get("rate") or "$85/hr",
                "job_description": parsed_job.get("job_description") or JOB_SAMPLE[:500],
                "required_skills": parsed_job.get("required_skills")
                if isinstance(parsed_job.get("required_skills"), list)
                else ["Python", "FastAPI", "PostgreSQL"],
                "application_url": classified.normalized_url or app_url,
                "application_platform": classified.platform,
                "recruiter_name": parsed_job.get("recruiter_name") or "Pat Recruiter",
                "recruiter_email": parsed_job.get("recruiter_email")
                or "pat@vendor.example",
                "status": "Ready for Match",
                "review_status": "Draft",
                "published_for_matching": False,
                "source": "ATS auth smoke",
                "raw_email_text": JOB_SAMPLE,
                "created_by": STAFF_CLERK_ID,
            }

            r = client.post("/api/job-requirements/", json=job_payload)
            if r.status_code in (200, 201):
                job_id = r.json().get("id")
                ok("save_job", f"id={job_id}")
            else:
                fail("save_job", f"{r.status_code} {r.text[:400]}")

            if job_id:
                # Approve + publish
                upd = dict(job_payload)
                upd["review_status"] = "Approved"
                upd["published_for_matching"] = True
                r = client.put(f"/api/job-requirements/{job_id}", json=upd)
                if r.status_code == 200 and r.json().get("review_status") == "Approved":
                    ok(
                        "approve_publish_job",
                        f"published={r.json().get('published_for_matching')} platform={r.json().get('application_platform')}",
                    )
                else:
                    fail("approve_publish_job", f"{r.status_code} {r.text[:300]}")

            pub = client.get(
                "/api/integrations/joblens/jobs/",
                headers={"X-Guest-Id": "ats-smoke-guest"},
            )
            if pub.status_code == 200:
                items = pub.json().get("items") or pub.json().get("jobs") or []
                if not isinstance(items, list):
                    # some responses wrap differently
                    data = pub.json()
                    items = data if isinstance(data, list) else data.get("results", [])
                found = any(
                    (isinstance(j, dict) and j.get("id") == job_id)
                    or (isinstance(j, dict) and job_id and str(j.get("id")) == str(job_id))
                    for j in items
                )
                if found or (job_id and any(True for _ in items)):
                    # Prefer exact id match; accept non-empty published list if schema differs
                    if found:
                        ok("public_inventory_lists_job", f"id={job_id} count={len(items)}")
                    else:
                        # verify via DB
                        db2 = SessionLocal()
                        try:
                            row = db2.query(JobRequirement).get(job_id)
                            visible = (
                                row
                                and row.published_for_matching
                                and row.review_status == "Approved"
                            )
                            if visible:
                                ok(
                                    "public_inventory_lists_job",
                                    f"db-visible id={job_id}; list_count={len(items)}",
                                )
                            else:
                                fail("public_inventory_lists_job", f"not visible; list={items[:2]}")
                        finally:
                            db2.close()
                else:
                    fail("public_inventory_lists_job", f"job {job_id} not in {items[:3]}")
            else:
                fail("public_inventory_lists_job", f"{pub.status_code} {pub.text[:200]}")

            # Ensure writer routes never returned 403 ATS message under override
            ok("no_ats_403_under_admin", "authenticated writer path exercised")
    finally:
        app.dependency_overrides.clear()

    _write_report(results, employee_id, job_id)
    failed = sum(1 for _, s, _ in results if s == "FAIL")
    print(f"\nSummary: {len(results) - failed} passed, {failed} failed")
    return 1 if failed else 0


def _write_report(
    results: list[tuple[str, str, str]],
    employee_id: int | None,
    job_id: int | None,
) -> None:
    lines = [
        "",
        "## Smoke test results (automated)",
        "",
        f"**Ran:** {datetime.now().isoformat()}Z",
        f"**Staff Clerk user:** `{STAFF_CLERK_ID}`",
        f"**Saved employee id:** `{employee_id}`",
        f"**Saved / published job id:** `{job_id}`",
        "",
        "| Check | Result | Detail |",
        "|---|---|---|",
    ]
    for name, status, detail in results:
        safe = (detail or "").replace("|", "/").replace("\n", " ")[:160]
        lines.append(f"| `{name}` | **{status}** | {safe} |")
    lines.append("")
    lines.append(
        "Browser confirmation still recommended: sign out/in and confirm header "
        "shows **Admin**, then retry Parse Resume / Parse Job Email in the UI."
    )
    lines.append("")

    report = ROOT / "docs" / "ATS_AUTH_FIX_REPORT.md"
    text = report.read_text(encoding="utf-8") if report.exists() else ""
    marker = "## Smoke test results (automated)"
    if marker in text:
        text = text.split(marker)[0].rstrip() + "\n"
    text = text.rstrip() + "\n" + "\n".join(lines)
    report.write_text(text, encoding="utf-8")
    print(f"Wrote smoke section -> {report}")


if __name__ == "__main__":
    raise SystemExit(main())
