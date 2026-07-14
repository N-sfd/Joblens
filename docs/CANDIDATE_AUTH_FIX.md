# Add Candidate authentication fix — completion report

**Date:** 2026-07-14  
**Branch:** `crm-consolidation/production-readiness`

## Exact failing request

| Field | Finding |
|-------|---------|
| Request URL | `POST /api/candidates/` (duplicate check first: `POST /api/candidates/check-duplicates`) |
| Method | POST |
| Typical user-facing message | “Something went wrong” / “Your session has expired…” |
| Auth header | Often **missing or stale** before the CRM FastAPI hop |
| Root cause | Frontend threw “session expired” when Clerk `getToken()` was not ready / bridge not loaded, **without** waiting for Clerk `isLoaded`, and had **no** one-shot 401 refresh retry. BFF proxy could also forward a mismatched `Content-Length` on buffered bodies. |

Failure often occurred at **duplicate check or candidate create**, before resume upload — not necessarily a truly expired Clerk session.

## Root cause (summary)

1. `AtsAuthBridge` registered `getToken` but API client raced before Clerk finished loading and treated `null` as expired.
2. No `getToken({ skipCache: true })` retry after HTTP 401.
3. Misleading copy: every missing token looked like “session expired”.
4. Proxy re-buffering posts without clearing `Content-Length`.

## Fixes

### Frontend token handling

- Fresh token via bridge on **every** protected request after Clerk `isLoaded` + `isSignedIn`.
- One retry with `getToken({ skipCache: true })` on 401; second 401 → sign-in redirect.
- FormData uploads do not set `Content-Type` manually.
- Status-specific error mapping (`atsApiErrors.ts`); 403 ≠ session expired.
- Add Candidate gates Save until session ready (“Verifying your session…”).
- Resume upload failure after create → partial success; candidate preserved.

### Backend auth

- Candidate create already used `require_writer` (same as Jobs/Zoho writers).
- Safer token validation categories logged (`missing`, `expired`, `invalid_issuer`, `invalid_audience`, …) with request ID — never tokens/secrets.

### BFF proxy

- Explicit `Authorization` forward; delete inbound `Content-Length` before upstream fetch.

## Verification matrix

| Item | Result |
|------|--------|
| Exact failing request | `POST /api/candidates/` (+ often prior `check-duplicates`) |
| Original response status | Client-side throw **or** backend **401** with UNAUTHORIZED_MSG |
| Root cause | Token readiness / no refresh retry / misleading mapping |
| Frontend token fix | Done |
| Backend auth fix | Diagnostics + confirmed shared `require_writer` |
| Clerk env verification | **Ops**: confirm Vercel FE + FastAPI share same production Clerk project |
| CRM backend URL | Browser uses same-origin `/api` → `BACKEND_URL` |
| CORS | Same-origin proxy avoids browser CORS for ATS calls; backend `ALLOWED_ORIGINS` still required for any direct FE→API calls |
| Role resolution | Writers create; read_only → 403 + permission message |
| Tests added | `backend/tests/test_candidates_auth.py`, `frontend/src/lib/atsApiErrors.test.mjs` |
| Tests passed | candidates+ats auth 16 passed; node error tests 11 passed |
| TypeScript | `tsc --noEmit` passed |
| Production build | `npm run build` passed |
| Remaining limitations | Live Clerk production keys + correct `BACKEND_URL` must be set in deployment; this environment cannot mint real Clerk JWTs |

## Files modified

- `frontend/src/lib/clerkToken.ts`
- `frontend/src/components/AtsAuthBridge.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/lib/atsApiErrors.ts`
- `frontend/src/lib/atsApiErrors.test.mjs`
- `frontend/src/app/(ats)/ats/candidates/new/page.tsx`
- `frontend/src/app/api/[[...path]]/route.ts`
- `backend/ats_auth.py`
- `backend/tests/test_candidates_auth.py`
- `docs/CANDIDATE_AUTH_FIX.md`
