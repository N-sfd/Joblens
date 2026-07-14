# Release Gate Status — v1.0.0-crm-ats

**Date:** 2026-07-14  
**Decision:** Conditional GO — **do not tag or promote to production yet**

## Merge / review

| Item | Status |
|------|--------|
| Source branch | `crm-consolidation/production-readiness` @ `3a22ac0` |
| Proposed base | `main` |
| Stable checkpoint tag | `pre-production-readiness` (`efc3355`) — keep |
| `v1.0.0-crm-ats` tag | **HOLD** until all blockers = PASS |
| Production promote | **HOLD** |

Open PR (if not already open):

```text
https://github.com/N-sfd/Joblens/compare/main...crm-consolidation/production-readiness?expand=1
```

Suggested title: `Release candidate: Unified Recruitment CRM + ATS`

## Four blockers (must all PASS before tag/promote)

| # | Blocker | Owner | Status | Evidence |
|---|---------|-------|--------|----------|
| 1 | Production PostgreSQL backup + restore drill (checksum, non-prod restore, count verification) | Ops / release owner | **OPEN** | See `docs/DATABASE_BACKUP_AND_RESTORE.md` |
| 2 | Staging RC smoke with real Clerk JWTs (admin + recruiter) and Zoho test path | Release owner | **OPEN** | `backend/scripts/production_smoke_test.py` + `/ats` login on RC |
| 3 | `docs/PRODUCTION_QA_CHECKLIST.md` completed with evidence | QA / release owner | **OPEN** | No checkboxes may be marked without artifacts |
| 4 | Production secrets + storage + seeker flags | Release owner | **OPEN** | Vercel must have Clerk keys; `SEEKER_PRODUCT_ENABLED=false`; `NEXT_PUBLIC_SEEKER_PRODUCT_ENABLED=false`; non-local resume storage |

### Blocker 4 detail (current production Vercel)

As of last check, Vercel project `joblens` Environment Variables included only:

- `NEXT_PUBLIC_API_URL`
- `BACKEND_URL`

**Missing for ATS auth:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`  
Add for Preview + Production before treating RC as signed off. Also set seeker flags to `false` for CRM-only production.

## Staging RC

| Item | Value |
|------|--------|
| Deploy type | Vercel **Preview** (not `--prod`) |
| Branch | `crm-consolidation/production-readiness` |
| Preview URL | https://joblens-fc3dkuub5-n-sfds-projects.vercel.app |
| Staging RC alias | https://joblens-staging-rc.vercel.app |
| Inspect | https://vercel.com/n-sfds-projects/joblens/9Y22gLtMN94CqNhDtQ7JRB5ZLvB6 |
| Production alias | Do **not** retarget until hard GO |

Record additional smoke targets:

```text
RC_URL=https://joblens-staging-rc.vercel.app
SMOKE_BASE_URL=          # backend staging / Render RC — still required
Inspect=https://vercel.com/n-sfds-projects/joblens/9Y22gLtMN94CqNhDtQ7JRB5ZLvB6
```

## Hard GO sequence (only after blockers PASS)

1. Merge PR into `main` after review approval  
2. Confirm backup + restore drill PASS recorded  
3. Confirm QA checklist evidence attached  
4. Confirm secrets / storage / seeker flags  
5. Tag:

```bash
git checkout main
git pull
git tag -a v1.0.0-crm-ats -m "Unified Recruitment CRM and ATS production release"
git push origin v1.0.0-crm-ats
```

6. Deploy backend + run migrations once  
7. `vercel --prod` (or promote RC)  
8. Run smoke tests  
9. Monitor  

## Explicitly not done in this session

- No `v1.0.0-crm-ats` tag created  
- No production cutover / alias flip from this gate document  
- No production database overwrite  
