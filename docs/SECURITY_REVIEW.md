# Security Review — Phase 8

Date: 2026-07-14  
Branch: `crm-consolidation/production-readiness`  
Scope: Unified Recruitment CRM + ATS (no new product features)

## Authentication

| Finding | Severity | Status |
|---------|----------|--------|
| Clerk JWT verification on private ATS routes (`ats_auth.py`) | — | In place |
| Production requires `ATS_AUTH_ENFORCE=true` | — | Enforced at startup |
| Frontend middleware alone is not trusted | — | Documented |

## Authorization

| Finding | Severity | Status |
|---------|----------|--------|
| Mutations use `require_writer` / `require_admin` patterns | — | Existing |
| Recruiter owner scoping on primary modules | — | Existing |
| Read Only can view/export reports, not mutate | — | Confirmed by tests |

## Organization isolation

| Finding | Severity | Status |
|---------|----------|--------|
| Single-organization deployments today; `created_by` scoping for recruiters | Medium (future multi-tenant) | Accepted risk — document before multi-tenant |
| IDOR tests for cross-org keys | Medium | Expand when org_id is introduced globally |

## Upload security

| Finding | Severity | Status |
|---------|----------|--------|
| Extension + MIME allowlist, 10 MB cap, sanitized names | — | Existing |
| Magic-byte verification incomplete; `.doc` limited | Low | Accepted — prefer PDF/DOCX |
| Authenticated downloads; no public permanent URLs for resumes | — | Existing pattern |

## Secrets scan (repo)

| Finding | Severity | Status |
|---------|----------|--------|
| No live `sk-` production keys in tracked source | — | Pass (placeholders in `.env.example` only) |
| `.env` must remain untracked | — | Ops responsibility |
| History rotation if prior accidental commit | High if found | Ops to rotate on discovery |

## CSV / XSS

| Finding | Severity | Status |
|---------|----------|--------|
| Formula injection (`=`, `+`, `-`, `@`) prefixed | Medium | **Fixed** (`services/csv_safe.py`) |
| Resume text / tokens excluded from report CSV | — | Covered by tests |

## CORS & headers

| Finding | Severity | Status |
|---------|----------|--------|
| Explicit `ALLOWED_ORIGINS`; no credentials+`*` | — | Validated in production startup |
| `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS (https) | — | **Added** |
| CSP not yet strict | Low | Accepted — follow-up |

## Rate limiting

| Finding | Severity | Status |
|---------|----------|--------|
| AI / Zoho / extension / CSV export limits | — | In-memory sliding window |
| Not shared across multi-instance | Medium | Accepted for single-instance Render; Redis follow-up |

## Logging

| Finding | Severity | Status |
|---------|----------|--------|
| Request ID header + response timing | — | **Added** |
| Avoid logging resume/email/token bodies | — | Policy documented |

## Dependency review

Run before each release:

```bash
cd frontend && npm audit
cd backend && pip check
```

Do not large-upgrade mid-freeze unless critical CVE.

## Accepted risks (Conditional GO)

1. Single-tenant assumption without hard `organization_id` on every table  
2. In-memory rate limits  
3. Soft CSP  
4. Production backup/restore drill must be completed by ops before hard GO  

## Blockers for hard NO-GO

Auth bypass, resume/email exposure, failed restore with no recovery path, missing production secrets with `ENV=production`.
