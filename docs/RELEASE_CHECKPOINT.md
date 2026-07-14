# Release checkpoint — Phase 8

| Field | Value |
|-------|--------|
| Release date | 2026-07-14 |
| Release owner | CRM consolidation / release engineer |
| Stable starting commit | `efc3355241c488f326f9cda1e6c6207d634dabe9` (`pre-production-readiness`) |
| Consolidation branch | `crm-consolidation/phase-0-foundation` (preserved) |
| Production-readiness branch | `crm-consolidation/production-readiness` |
| Migration head | `l2a3b4c5d6e7` |
| Backend version | `1.0.0` (`main.py`) |
| Frontend build | Next.js production build (see CI / local `npm run build`) |
| Release tag | Deferred until hard GO — use `v1.0.0-crm-ats` after ops backup/restore + RC sign-off |
| Decision | **Conditional GO** |

## Follow-up before hard GO

1. Production PostgreSQL backup + restore drill with checksum  
2. Staging RC smoke with real Clerk tokens  
3. Manual QA checklist evidence  
4. Set `SEEKER_PRODUCT_ENABLED=false` / `NEXT_PUBLIC_SEEKER_PRODUCT_ENABLED=false` in production  
5. Confirm non-local file storage for resumes  
