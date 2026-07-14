# Route Consolidation

Unified Recruitment CRM + ATS route map after Phase 8 cleanup.

## Active primary routes

| Route | Module |
|-------|--------|
| `/ats` | Dashboard |
| `/ats/email-inbox` | Zoho Inbox |
| `/ats/jobs` | Jobs |
| `/ats/jobs/[id]` | Job detail |
| `/ats/candidates` | Candidates |
| `/ats/candidates/[id]` | Candidate detail |
| `/ats/pipeline` | Pipeline |
| `/ats/pipeline/[id]` | Pipeline detail |
| `/ats/contacts` | Contacts |
| `/ats/contacts/[id]` | Contact detail |
| `/ats/contacts/companies/[id]` | Company detail |
| `/ats/reports` | Reports |
| `/ats/settings` | Settings / Personal Settings |

## Redirected legacy routes

Query strings are preserved (and mapped where noted).

| Legacy | Target |
|--------|--------|
| `/ats/employees` | `/ats/candidates` |
| `/ats/employees/[id]` | `/ats/candidates/[id]` |
| `/ats/employee-resumes` | `/ats/candidates` |
| `/ats/job-requirements` | `/ats/jobs` |
| `/ats/job-requirements/[id]` | `/ats/jobs/[id]` |
| `/job-requirements` | `/ats/jobs` |
| `/employees` | `/ats/candidates` |
| `/ats/submissions` | `/ats/pipeline` (status → stage_group) |
| `/ats/submissions/[id]` | `/ats/pipeline/[id]` |
| `/ats/recruiters` | `/ats/contacts?type=recruiter` |
| `/ats/clients` | `/ats/contacts?view=companies&type=client` |
| `/ats/vendors` | `/ats/contacts?view=companies&type=vendor` |
| `/ats/companies` | `/ats/contacts?view=companies` |
| `/ats/companies/[id]` | `/ats/contacts/companies/[id]` |
| `/ats/interviews` | `/ats/pipeline?stage_group=interview` |
| `/ats/offers` | `/ats/pipeline?stage_group=offer` |

Implemented in `frontend/src/middleware.ts`.

## Deprecated API prefixes (still mounted)

Shared routers — no duplicate business logic:

| Prefix | Alias of |
|--------|----------|
| `/api/employees` | `/api/candidates` |
| `/api/job-requirements` | Jobs entity |
| `/api/submissions` | `/api/pipeline` |
| `/api/companies` | `/api/crm/organizations` |
| `/api/contacts` | `/api/crm/contacts` |

## Hidden / feature-flagged routes

| Area | Control |
|------|---------|
| Job-seeker product (`/`, `/dashboard`, `/jobs`, `/resume`, `/match`, …) | `NEXT_PUBLIC_SEEKER_PRODUCT_ENABLED` / `SEEKER_PRODUCT_ENABLED` |
| Browser extension APIs | Extension feature flags |
| `/ats/activities`, `/ats/job-sends`, `/ats/onboarding` | Not in primary nav; may remain for deep links |

## Scheduled for future removal

After production stability (not this release):

- Dead page stubs that only redirect when middleware already covers them
- Seeker routers once product sunset is confirmed
- Legacy API path names once all clients migrate
