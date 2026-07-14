# Rollback Plan

## Decision maker

Release owner / on-call engineer with production access.

## Previous stable markers

| Marker | Value |
|--------|--------|
| Consolidation branch | `crm-consolidation/phase-0-foundation` |
| Pre-readiness tag | `pre-production-readiness` |
| Stable SHA (Reports complete) | `efc3355241c488f326f9cda1e6c6207d634dabe9` |
| Production-readiness branch | `crm-consolidation/production-readiness` |

## Triggers (immediate rollback / restore)

- Authentication failure across users
- Authorization bypass or cross-org data access
- Resume / email body exposure
- Migration failure or data corruption
- Sustained high 5xx
- Broken Pipeline transitions / mass duplicate imports
- Report data leakage of sensitive fields

## Frontend rollback

1. Redeploy previous Vercel/production deployment for the last known-good commit/tag.
2. Confirm Clerk keys still match backend issuer.
3. Smoke-test login + `/ats`.

## Backend rollback

1. Redeploy previous Render (or host) release pinned to `pre-production-readiness` or last known-good SHA.
2. Prefer **restore from pre-release dump** over speculative Alembic downgrade when schema changed.
3. Verify `/health` and `/health/ready`.

## Database

| Situation | Action |
|-----------|--------|
| Migration not applied | Redeploy previous app; no DB change |
| Migration applied, unsafe | Restore dump into production **only** after freeze + owner approval |
| Partial write corruption | Restore + replay if needed; do not invent manual row fixes under pressure |

Alembic downgrades are secondary; restores are safer for integrity incidents.

## Environment / Zoho / Auth / Storage

- Revert env var change in the host panel; redeploy.
- Zoho: disable sync (disconnect/admin) before re-rolling tokens.
- Auth: restore previous Clerk production keys only if intentionally rotated; never mix projects.
- Storage: switch provider credentials carefully; verify one authenticated resume download.

## Verification after rollback

- [ ] Login
- [ ] Dashboard counts load
- [ ] Jobs / Candidates / Pipeline list
- [ ] No unexpected 500s in logs (15–30 min)
- [ ] Zoho status (if enabled)
- [ ] `/health/ready` → ready
