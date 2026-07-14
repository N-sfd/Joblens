# Release checkpoint — Phase 8

| Field | Value |
|-------|--------|
| Release date | 2026-07-14 |
| Release owner | CRM consolidation / release engineer |
| Stable starting commit | `efc3355241c488f326f9cda1e6c6207d634dabe9` (`pre-production-readiness`) |
| Consolidation branch | `crm-consolidation/phase-0-foundation` (preserved) |
| Production-readiness branch | `crm-consolidation/production-readiness` @ `3a22ac0` |
| Migration head | `l2a3b4c5d6e7` |
| Backend version | `1.0.0` (`main.py`) |
| Frontend build | Next.js production build (see CI / local `npm run build`) |
| Release tag | **HOLD** — `v1.0.0-crm-ats` only after hard GO |
| Production cut | **HOLD** — do not promote until four blockers PASS |
| Decision | **Conditional GO** |

Gate tracking: [RELEASE_GATE_STATUS.md](./RELEASE_GATE_STATUS.md)

## Four blockers before tag / promote

1. Production PostgreSQL backup + restore drill with checksum  
2. Staging RC smoke with real Clerk tokens (and Zoho test path)  
3. Manual QA checklist evidence (`PRODUCTION_QA_CHECKLIST.md`)  
4. Production secrets (Clerk on Vercel) + non-local resume storage + seeker flags `false`  

## Allowed now

- Merge/review PR into `main` (or keep RC branch)  
- Deploy **staging / Vercel Preview** RC  
- Document backup/restore results without overwriting production  

## Forbidden until hard GO

- `git tag v1.0.0-crm-ats`  
- Production alias cutover as the “official” release  
- Destructive production DB operations without signed-off backup  
