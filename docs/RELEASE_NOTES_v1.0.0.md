# Release Notes — v1.0.0 CRM + ATS

**Product:** Consult America / JobLens Unified Recruitment CRM + ATS  
**Date:** 2026-07-14  
**Tag target:** `v1.0.0-crm-ats` (create after release gates)

## What’s included

- **Dashboard** — operational counts shared with Reports  
- **Zoho Inbox** — recruiter email → job import  
- **Jobs** — unified job requirements module  
- **Candidates** — unified employee/candidate + resumes  
- **Pipeline** — submissions, interviews, offers, placements  
- **Contacts** — people + companies (recruiters, clients, vendors)  
- **Reports** — overview, jobs, candidates, pipeline, contacts, activity, CSV  
- **Settings** — integrations and personal settings by role  

## Navigation

Eight primary items. Legacy Employees / Job Requirements / Submissions / Recruiters / Clients / Vendors / separate Interviews & Offers redirect to the unified modules.

Job-seeker product (Discover Jobs, Resume Analyzer, etc.) remains feature-flagged and is not part of the CRM primary nav.

## Security / ops highlights

- Production auth enforcement + readiness probes  
- Security headers + request IDs  
- CSV formula-injection hardening  
- Role matrix and deployment / rollback docs  

## Known limitations

- Pipeline conversion reports may be labeled “Based on current pipeline stages”  
- Single-organization model without full multi-tenant isolation columns  
- Production backup/restore must be validated by ops for hard GO  
- Seeker product and extension code retained behind flags  

## Upgrade notes

1. Set production env per `docs/ENVIRONMENT_VARIABLES.md`  
2. Backup DB → migrate `alembic upgrade head` once  
3. Deploy backend → `/health/ready` → deploy frontend  
4. Run `backend/scripts/production_smoke_test.py`  

## Thank you

Consolidation phases 0–8 delivered on branch `crm-consolidation/phase-0-foundation` with production readiness on `crm-consolidation/production-readiness`.
