# Production deploy (Vercel + Render)

## Prerequisites

- GitHub repo: `https://github.com/N-sfd/Joblens.git`
- Local data already migrated to Postgres (see below)
- Clerk, Zoho, and Groq credentials ready

---

## A. Local data migration (done / re-run anytime)

```powershell
cd backend
# DATABASE_URL must point at Postgres
python -m alembic upgrade head
python scripts\migrate_sqlite_to_postgres.py --truncate
```

Source: `backend/aijob.db` → Target: `DATABASE_URL` Postgres.

To load the same dump into **Render Postgres** later:

1. In Render → joblens-db → copy **External Database URL**
2. Temporarily set it as `DATABASE_URL` in a one-off shell (or use `psql` / the migrate script with that URL)
3. Run `alembic upgrade head` then `migrate_sqlite_to_postgres.py --truncate`

---

## B. Backend → Render

### Option 1 — Blueprint (`render.yaml`)

1. Push latest `main` to GitHub.
2. Render → **New** → **Blueprint** → select this repo.
3. Approve `joblens-db` (Postgres) + `joblens-api` (web).
4. Fill every `sync: false` env var in the dashboard:

| Key | Value |
|-----|--------|
| `GROQ_API_KEY` | your Groq key |
| `ALLOWED_ORIGINS` | `https://<your-vercel-app>.vercel.app` |
| `CLERK_SECRET_KEY` | `sk_live_...` (or test while validating) |
| `CLERK_JWKS_URL` | `https://<instance>.clerk.accounts.dev/.well-known/jwks.json` |
| `CLERK_ISSUER` | `https://<instance>.clerk.accounts.dev` |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` | from Zoho API console |
| `ZOHO_REDIRECT_URI` | `https://<your-vercel-app>.vercel.app/ats/settings/zoho/callback` |
| `TOKEN_ENCRYPTION_KEY` | Fernet key (same as local if you want Zoho tokens to decrypt after migrate) |

`DATABASE_URL`, `ATS_AUTH_ENFORCE=true`, and `ENV=production` come from the blueprint.

5. Deploy. Start command runs `alembic upgrade head` then uvicorn.
6. Confirm `https://<service>.onrender.com/health` → `{"status":"healthy"}`.

### Option 2 — Manual web service

Same env vars as above; Root Directory `backend`; Start:

```text
python -m alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT
```

Attach a Render Postgres and set `DATABASE_URL` from that database.

---

## C. Frontend → Vercel

1. Import repo → Root Directory `frontend`.
2. Environment variables:

| Key | Value |
|-----|--------|
| `BACKEND_URL` | `https://<joblens-api>.onrender.com` (no `/api`) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` / `pk_test_...` |
| `CLERK_SECRET_KEY` | matching Clerk secret |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | `/sign-up` |

3. Deploy. Turn off Vercel Deployment Protection if the public site must be open.

---

## D. Post-deploy checklist

- [ ] Clerk: production instance (or keep test) — set `public_metadata.role` = `admin` for your user
- [ ] Zoho API console: add production redirect URI
- [ ] Reconnect Zoho in `/ats/settings/zoho` (or migrate `zoho_connections` with the **same** `TOKEN_ENCRYPTION_KEY`)
- [ ] ATS pages require sign-in (`ATS_AUTH_ENFORCE=true`)
- [ ] Create a job from inbox → match → send → submission smoke path
- [ ] Resume uploads: local disk on Render is ephemeral — plan Supabase/S3 before heavy use

---

## E. Push code (when ready)

```powershell
git status
git add render.yaml backend/scripts/migrate_sqlite_to_postgres.py backend/scripts/set_clerk_role.py docker-compose.postgres.yml
# plus other Phase 8 / hardening files you want in the release
git commit -m "Add Postgres migration tooling and production Render blueprint"
git push origin main
```

Do not commit `backend/.env`, `*.db`, or secrets.
