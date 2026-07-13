# ATS Authorization Fix Report

**Date:** 2026-07-13  
**Status:** Fixed (role resolved via DB fallback; Clerk FE/BE project aligned)

## Root cause

With `ATS_AUTH_ENFORCE=true`, write routes (`require_writer`) require role `admin` or `recruiter`.

Role resolution previously depended on:

1. JWT claims (`public_metadata.role` / `role`) — usually **absent** from default Clerk session tokens  
2. Clerk Backend API lookup — from this environment often **fails** (HTTP 403 / Cloudflare 1010)

Failure on both paths defaulted the principal to **`viewer`**, so:

- `POST /api/employees/parse-resume`
- Job-email parse / create-from-email routes under `require_writer`

returned **403** *before* any AI parser ran. That matched the UI copy about lacking recruiter/admin permission.

This was **not** an AI-key, Groq, Zoho, or file-type failure.

## Role source (current)

Resolution order in `backend/ats_auth.py` (never trusts a browser-supplied role):

1. Verified JWT claims  
2. Clerk Backend API `public_metadata` (when reachable)  
3. **`ats_staff_users` row** keyed by Clerk user id ← **primary fix path**  
4. Bootstrap allowlist: `ATS_BOOTSTRAP_ADMIN_EMAILS` / `ATS_BOOTSTRAP_ADMIN_USER_IDS`  
5. Default `viewer` when enforced

Roles normalized to lowercase enums: `admin` | `recruiter` | `viewer` (aliases: `Admin`, `hr_admin`, etc.).

## Account role assigned

| Clerk user id | Role | Org | Source |
|---|---|---|---|
| `user_3FxSaAuW1oGdWPyB5LJQFy4KQSc` | `admin` | Consult America | `ats_staff_users` (script) |

Grant / change again:

```bash
cd backend
python scripts/set_ats_db_role.py admin --clerk-user-id <CLERK_USER_ID> --email you@company.com --name "Your Name"
```

Or use **ATS → Settings → Staff access** (admin-only) after first admin exists.

**After any role change:** sign out and sign back in (clears client cache; server role cache TTL is 5 minutes, invalidated on DB updates via admin API/script).

## Endpoints corrected (auth layer)

Shared dependency: `require_writer` → allows `admin`, `recruiter`.

| Action | Endpoint (representative) |
|---|---|
| Parse resume | `POST /api/employees/parse-resume` |
| Add employee | `POST /api/employees` |
| Parse job details | `POST /api/job-requirements/parse` (+ Zoho parse routes) |
| Create job from email | Zoho create-from-email / job-requirement create |
| Re-parse job email | Zoho reparse routes |

Messages:

- **401:** session expired / sign in again  
- **403:** no ATS access — ask admin for Recruiter or Admin  
- **500:** could not verify ATS permissions  

AI / Zoho / file errors remain distinct from auth.

Safe auth logs (no resumes, emails bodies, tokens, prompts): user id, email, route, resolved role, required roles, org id/name, allow/deny.

## Environment verified

| Check | Result |
|---|---|
| Frontend `NEXT_PUBLIC_API_URL` | `http://localhost:8000` |
| Frontend Clerk publishable key | `pk_test_…` → instance **handy-kit-5** |
| Backend `CLERK_ISSUER` / JWKS | `https://handy-kit-5.clerk.accounts.dev` |
| Backend `ATS_AUTH_ENFORCE` | `true` |
| FE/BE Clerk project mismatch | **Not present** (same instance) |
| DB | Postgres `127.0.0.1:5433` + migration `j0e1f2a3b4c5` (`ats_staff_users`) |

Optional Clerk Dashboard hardening: customize session JWT to include `role` and `email` claims so path (1) works without Clerk API or DB.

## UI / admin

- Header: **Name · Role** (+ organization) via `AtsHeaderAccount`  
- Gate: signed-in users without admin/recruiter see access screen (Return to JobLens / Contact Administrator / Sign Out) — `AtsAccessGate`  
- Admin user management: `/ats/settings/users` — list users, assign Admin/Recruiter/Viewer (remove ATS write access), org, role-change timestamp; audit via `log_audit`

## Tests completed

| Test | Result |
|---|---|
| `tests/test_ats_auth.py` (normalize, DB writer, 403 message, `/api/ats/me`, parse ≠ auth confusion) | **5 passed** |
| Unauthenticated `/api/ats/me` / parse-resume with enforce | Expected **401** when backend enforce is on |
| Live browser parse as admin/recruiter | **Manual:** sign out/in as granted user, then Parse Resume / Parse Job Details |
| Normal JobLens user (viewer / no staff row) | **403** on writer routes; candidate JobLens features unchanged |
| Role promotion viewer → recruiter | Sign out/in; actions succeed |

## Files modified / added

**Backend**

- `backend/ats_auth.py` — multi-source role resolution, logging, messages  
- `backend/models.py` — `AtsStaffUser`  
- `backend/migrations/versions/j0e1f2a3b4c5_add_ats_staff_users.py`  
- `backend/routers/ats_staff.py` — `/api/ats/me`, admin user CRUD  
- `backend/scripts/set_ats_db_role.py`  
- `backend/main.py` — register router  
- `backend/.env.example` — bootstrap docs  
- `backend/tests/test_ats_auth.py`

**Frontend**

- `frontend/src/lib/atsRole.ts`  
- `frontend/src/lib/api.ts` — ATS me / staff helpers  
- `frontend/src/components/AtsAccessGate.tsx`  
- `frontend/src/components/AtsHeaderAccount.tsx`  
- `frontend/src/app/(ats)/layout.tsx`  
- `frontend/src/app/(ats)/ats/settings/users/page.tsx`  
- `frontend/src/app/(ats)/ats/settings/page.tsx` — Staff access link  

## What you should do now

1. Restart / confirm API on port 8000 with current `.env` (Postgres).  
2. Sign out of Clerk, sign back in as the staff account above.  
3. Confirm header shows **Admin** (or Recruiter).  
4. Retry Parse Resume and Parse Job Details.  
5. For additional staff: Settings → Staff access, or `set_ats_db_role.py`.

## Smoke test results (automated)

**Ran:** 2026-07-13T13:27:58.544617Z
**Staff Clerk user:** `user_3FxSaAuW1oGdWPyB5LJQFy4KQSc`
**Saved employee id:** `5`
**Saved / published job id:** `4`

| Check | Result | Detail |
|---|---|---|
| `api_health` | **PASS** | {'status': 'healthy'} |
| `unauth_ats_me_401` | **PASS** | Your session has expired. Please sign in again. |
| `unauth_parse_resume_401` | **PASS** | Your session has expired. Please sign in again. |
| `db_staff_role` | **PASS** | admin org=Consult America |
| `resolve_role_writer` | **PASS** | role=admin source=clerk_api |
| `ats_me_authenticated` | **PASS** | {"user_id": "user_3FxSaAuW1oGdWPyB5LJQFy4KQSc", "email": "smoke@consultamerica.example", "display_name": "Smoke Admin", "role": "admin", "role_source": "databas |
| `parse_resume_ai` | **PASS** | name=Jane Smoke Tester |
| `save_employee` | **PASS** | id=5 |
| `parse_job_ai` | **PASS** | title=Senior Python Engineer |
| `save_job` | **PASS** | id=4 |
| `approve_publish_job` | **PASS** | published=True platform=greenhouse |
| `public_inventory_lists_job` | **PASS** | id=4 count=2 |
| `no_ats_403_under_admin` | **PASS** | authenticated writer path exercised |

Browser confirmation still recommended: sign out/in and confirm header shows **Admin**, then retry Parse Resume / Parse Job Email in the UI.
