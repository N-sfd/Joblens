# Environment Variables

Required and optional configuration for JobLens **Recruitment CRM + ATS**.

**Never commit** `.env`, production credentials, tokens, resume files, email exports, or database dumps.

## Backend (`backend/.env`)

| Variable | Required (prod) | Notes |
|----------|-----------------|-------|
| `ENV` | Yes | Must be `production` on live hosts |
| `DATABASE_URL` | Yes | Managed PostgreSQL (`postgresql://…`). Do not use SQLite in production |
| `ALLOWED_ORIGINS` | Yes | Comma-separated frontend origins. **No `*`** with credentials |
| `ATS_AUTH_ENFORCE` | Yes | Must be `true` in production |
| `CLERK_JWKS_URL` | Yes | Clerk JWKS endpoint |
| `CLERK_ISSUER` | Yes | Clerk issuer URL |
| `CLERK_SECRET_KEY` | Recommended | Backend role/email lookup |
| `GROQ_API_KEY` | Recommended | Resume / job AI parsing |
| `FRONTEND_URL` | Recommended | Canonical frontend URL |
| `STORAGE_PROVIDER` | Yes if uploads | `supabase` (or equivalent) — not `local` on ephemeral hosts |
| `FILE_STORAGE_*` / bucket keys | If using object storage | See `backend/.env.example` |
| `ZOHO_CLIENT_ID` / `SECRET` / tokens | If Zoho enabled | Never log refresh tokens |
| `TOKEN_ENCRYPTION_KEY` | If Zoho tokens encrypted | Rotate on exposure |
| `AI_RATE_LIMIT_PER_MINUTE` | Optional | Default 20 |
| `ZOHO_RATE_LIMIT_PER_MINUTE` | Optional | Default 30 |
| `CSV_EXPORT_PER_MINUTE` | Optional | Default 10 |
| `SEEKER_PRODUCT_ENABLED` | Optional | Set `false` for CRM-only production |
| `LOG_LEVEL` | Optional | `INFO` / `WARNING` |
| `SENTRY_DSN` | Optional | Error monitoring |

Startup fails fast in production when required auth/CORS/database settings are missing or unsafe. Secret **values** are never printed.

## Frontend (`frontend/.env.local` / Vercel)

| Variable | Required (prod) | Notes |
|----------|-----------------|-------|
| `NEXT_PUBLIC_API_URL` or `BACKEND_URL` | Yes | Production API root (https). Prefer `BACKEND_URL` + same-origin proxy |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Same Clerk project as backend |
| `CLERK_SECRET_KEY` | Yes (server) | Middleware / Clerk; **never** prefix with `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SEEKER_PRODUCT_ENABLED` | Recommended `false` | Hides seeker product routes |
| `NEXT_PUBLIC_APP_ENV` | Optional | `production` |
| `NEXT_PUBLIC_PRODUCT_NAME` | Optional | Display name |

## Secret rotation checklist

1. Rotate the exposed secret at the provider (Clerk, Zoho, Groq, DB, storage).
2. Update production env vars.
3. Redeploy backend then frontend.
4. Invalidate old sessions / refresh tokens where applicable.
5. Confirm `/health/ready` and smoke tests.
6. Record rotation date in the ops log (no secret values).

See also: `backend/.env.example`, `frontend/.env.example`.
