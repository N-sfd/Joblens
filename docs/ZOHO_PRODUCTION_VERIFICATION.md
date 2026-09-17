# Zoho recruiter-email sync — production verification report

**Date:** 2026-07-14  
**Branch:** `crm-consolidation/production-readiness`  
**Verdict:** **Not complete** — code and UI are ready for real sync; production OAuth + one real email sync have **not** succeeded in this session.

Do **not** claim real Zoho synchronization is complete until the live checklist below passes.

---

## Architecture boundary (confirmed)

| Product | Routes | Zoho / CRM import |
|---------|--------|-------------------|
| Seeker | `/jobs` (Add Application) | **Must stay isolated** — no Zoho sync, no CRM contacts/companies, no ATS jobs |
| CRM + ATS | `/ats/zoho-inbox` → `/ats/email-inbox`, `/ats/settings/zoho` | OAuth, Sync Now, Parse Job, review, save |

Seeker `/jobs` was **not** modified for this work. Production probe: `https://joblens-seven.vercel.app/jobs` returned **200**.

---

## Required production report

| Item | Result |
|------|--------|
| Frontend production URL | `https://joblens-seven.vercel.app` (staging RC: `https://joblens-staging-rc.vercel.app`) |
| CRM FastAPI backend URL | **Unverified / likely wrong** — set Vercel `BACKEND_URL` to the CRM FastAPI host (not seeker-only APIs). Prefer same-origin `/api` proxy. |
| Clerk production project confirmed | **Blocked** — configure matching production project on Vercel FE + FastAPI |
| Frontend Clerk key configured | **Blocked** — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` on Vercel |
| Server Clerk secret configured | **Blocked** — `CLERK_SECRET_KEY` on Vercel (server only) + backend `CLERK_*` / `ATS_AUTH_ENFORCE=true` |
| CORS result | **Blocked** — set backend `ALLOWED_ORIGINS` to exact FE origins (no `*`) |
| Zoho OAuth status | **Blocked** — set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY` on CRM backend |
| Zoho account connected | **Not verified** (requires live OAuth) |
| Sync test result | **Not run** (requires connected mailbox) |
| Messages retrieved / new / skipped | — |
| Job created / Recruiter linked / Company linked | — |
| Duplicate-prevention result | **Code ready** — unique `(connection_id, zoho_message_id)`; create-job returns `Already imported` with Open Job / Recruiter / Company links |
| Role-access result | **Code ready** — writers (`admin`/`manager`/`recruiter`) connect/sync/parse; `read_only` cannot; disconnect admin-only |
| Seeker `/jobs` isolation result | **Pass (route probe)** — unchanged seeker tracker; Zoho path is ATS-only |
| Remaining blockers | See below |

---

## Remaining blockers (ops)

1. Point Vercel `BACKEND_URL` at **this** CRM FastAPI deployment; remove conflicting seeker/preview API URLs.
2. Set production Clerk publishable + secret (FE) and same Clerk JWKS/issuer/secret (backend); redeploy; sign out/in.
3. Set `ALLOWED_ORIGINS=https://joblens-seven.vercel.app` (+ approved ATS domains).
4. Configure Zoho OAuth app redirect URI exactly:  
   `https://joblens-seven.vercel.app/ats/settings/zoho/callback`  
   Match `ZOHO_REDIRECT_URI` on the backend. Store tokens only server-side (`TOKEN_ENCRYPTION_KEY`).
5. Run Alembic including `m3b4c5d6e7f8` (`last_sync_summary`).
6. As ATS Admin: Connect → Sync Now → Parse → Save → re-sync (zero duplicates) → role checks.

### Env checklist (names used by this repo)

**Frontend (Vercel):** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `BACKEND_URL`  
**Backend:** `ALLOWED_ORIGINS`, `CLERK_JWKS_URL`, `CLERK_ISSUER`, `CLERK_SECRET_KEY`, `ATS_AUTH_ENFORCE=true`, `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REDIRECT_URI`, optional `ZOHO_ACCOUNTS_BASE_URL` / `ZOHO_MAIL_API_BASE_URL`, `TOKEN_ENCRYPTION_KEY`

Never put Zoho or Clerk secrets in `NEXT_PUBLIC_*`, localStorage, query strings, client API responses, or logs.

### Smoke endpoints (after CRM backend is correct)

`/health`, `/health/ready`, `/api/dashboard/summary`, `/api/job-requirements`, `/api/contacts`, `/api/pipeline`, `/api/zoho/status` (alias of `/api/zoho/connection`)

---

## Code readiness shipped on this branch

- Canonical nav path `/ats/zoho-inbox` (redirects to inbox implementation)
- Safe connection status: Connected / expired / reauth / sync failed / temporarily unavailable; token status; last sync result; Connect / Reconnect / Sync Now / Disconnect
- Sync diagnostics (counts + request_id + user_id only — no bodies/tokens)
- Source label **Zoho Email** on import
- Matching: contact email → phone → name+company; company domain → exact name
- Duplicate import UX: **Already imported** with Open Job / Recruiter / Company
- Read Only: sync/connect controls hidden; API still enforces writer roles
