# Phase 5 M5 — Production cutover runbook

## Prerequisites

1. Local Postgres gate passed (M4)
2. Controlled pilot GO metrics (or Conditional GO with documented waivers)
3. Managed Postgres URL available (Render/Supabase/Neon)
4. Production frontend + API hostnames finalized

## Environment (API)

Set on the host (never commit secrets):

```
ENV=production
DATABASE_URL=postgresql://...
SECRET_KEY=...
EXTENSION_JWT_SECRET=...   # distinct from SECRET_KEY preferred
EXTENSION_TOKEN_ISSUER=joblens-extension
EXTENSION_TOKEN_AUDIENCE=joblens-extension-api
EXTENSION_MIN_VERSION=0.4.0
EXTENSION_ALLOWED_ORIGINS=https://joblens.app,https://www.joblens.app
EXTENSION_ALLOWED_IDS=<chrome extension id after store/publish>
EXTENSION_PILOT_USER_IDS=<comma-separated>   # keep during pilot; widen later
EXTENSION_OPS_TOKEN=...
EXTENSION_ENABLED=true
EXTENSION_DIAGNOSTICS_ENABLED=true
EXTENSION_ASSISTED_FILL_ENABLED=true
EXTENSION_DOCUMENT_UPLOAD_ENABLED=true
EXTENSION_SUBMISSION_CONFIRMATION_ENABLED=true
EXTENSION_GREENHOUSE_ENABLED=true
ATS_AUTH_ENFORCE=true
# plus existing Clerk / CORS / storage vars
```

## Extension build cutover

```bash
cd browser-extension
# Point at real hosts if different from defaults:
# set JOBLENS_API_ORIGIN=https://api.yourdomain.com
# set JOBLENS_WEB_ORIGIN=https://yourdomain.com
npm run package:production
```

Update `manifest.production.json` host permissions if production domains differ from `joblens.app`.

## Database

```bash
cd backend
# DATABASE_URL=production...
python -m alembic upgrade head
python scripts/m0_backfill_and_report.py --database-url "$DATABASE_URL"
```

Optional one-time import from SQLite (non-prod only): `scripts/m4_sqlite_to_postgres.py`.

## Smoke after deploy

1. `/health` OK  
2. Extension connect → status → pilot/me  
3. Analyze fixture Greenhouse form  
4. Fill blocked for non-pilot; allowed for pilot IDs  
5. Revoke + emergency ops token drill  
6. `python scripts/m5_pilot_metrics.py` (or POST `/api/extension/ops/pilot-metrics`)

## Rollback

See `docs/PHASE5_M4_ROLLBACK.md` — prefer feature flags over DB downgrade.
