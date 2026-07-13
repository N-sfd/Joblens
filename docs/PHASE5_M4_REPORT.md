# Phase 5 — Milestone M4 Report

**Date:** 2026-07-09  
**Scope:** PostgreSQL validation tooling, production extension packaging, security hardening, privacy/docs, monitoring, pilot readiness.  
**Not in scope:** Silent submit, auto Submit, CAPTCHA bypass, employer credentials, headless automation, multi-platform, `<all_urls>`.

---

## Verdict

### **CONDITIONAL GO — controlled internal pilot (Postgres gate cleared locally)**

M4 engineering deliverables are in place. **Local PostgreSQL validation passed** on 2026-07-13 (migrations head `i9d0e1f2a3b4`, downgrade smoke on `joblens_test`, inventory report, **32** extension/M4 tests including PG concurrent uniqueness).

**Public / store release remains NO-GO** until:

1. ~~Docker Desktop + clean PostgreSQL migrations + inventory~~ **Done (local)**  
2. ~~PostgreSQL integration suite~~ **Done (`TEST_DATABASE_URL` — 32 passed)**  
3. Controlled pilot (3–5 testers) completes with acceptable metrics  
4. Production secrets (`EXTENSION_JWT_SECRET`, managed Postgres `DATABASE_URL`, pilot allowlist) are set in the **deploy** environment  

---

## Files created

| Path | Purpose |
|---|---|
| `backend/services/extension_flags.py` | Feature flags + pilot entitlement |
| `backend/services/extension_config.py` | Env validation, version gates |
| `backend/services/extension_audit.py` | Structured extension audit (no values/tokens) |
| `backend/scripts/m4_postgres_validate.py` | PG connectivity / migrate / schema checks |
| `backend/scripts/m4_sqlite_to_postgres.py` | Optional one-time data import + reconciliation |
| `backend/scripts/postgres_init/01_create_test_db.sql` | Creates `joblens_test` on first volume init |
| `backend/tests/test_m4_security.py` | Flags, rate limits, audit, version, PG-optional |
| `browser-extension/manifest.production.json` | Prod hosts only |
| `browser-extension/PERMISSIONS.md` | Permission rationale |
| `docs/EXTENSION_USER_GUIDE.md` | Install / use / disconnect |
| `docs/PHASE5_M4_PILOT_CHECKLIST.md` | Pilot + E2E script |
| `docs/PHASE5_M4_MONITORING.md` | Signals & alerts |
| `docs/PHASE5_M4_ROLLBACK.md` | Feature-flag rollback |
| `docs/PHASE5_M4_REPORT.md` | This report |
| `frontend/src/app/privacy/extension/page.tsx` | Extension privacy disclosures |

## Files modified

| Path | Change |
|---|---|
| `backend/services/extension_auth.py` | iss/aud JWT, version gates, revoke-all, audit hooks |
| `backend/services/rate_limit.py` | Extension API buckets |
| `backend/routers/extension.py` | Flags, rate limits, audit, feedback, emergency ops |
| `backend/routers/extension_upload.py` | Flags, rate limits, audit on upload/confirm |
| `backend/main.py` | `validate_extension_config_at_startup` |
| `backend/conftest.py` | Extension env defaults for tests |
| `backend/.env.example` | M4 production variables |
| `docker-compose.postgres.yml` | Test DB init mount |
| `browser-extension` build/package/manifest/popup/api | Prod build, CSP, onboarding, feedback, v0.4.0 |
| `docs/PHASE5_M0_REPORT.md` | Postgres inventory status update |

---

## PostgreSQL

| Field | Value |
|---|---|
| Version | **16.13** |
| DB name | `joblens` / test: `joblens_test` |
| Host:port | `127.0.0.1:5433` |
| Migration head | **`i9d0e1f2a3b4`** |
| Downgrade smoke | **Pass** on `joblens_test` |
| Backup | Volume `joblens_pgdata`; prod = provider backups |
| Validation | **Complete** 2026-07-13 — see `docs/PHASE5_M4_POSTGRES_VALIDATE.json` and updated `PHASE5_M0_REPORT.md` |

### Migrations applied

```bash
docker compose -f docker-compose.postgres.yml up -d
cd backend
python scripts/m4_postgres_validate.py --create-test-db --migrate --downgrade-smoke
python -m alembic upgrade head
python scripts/m0_backfill_and_report.py --database-url postgresql://joblens:joblens@127.0.0.1:5433/joblens
```

---

## Production package

| Item | Value |
|---|---|
| Version | **0.4.0** (semantic pilot build; M1–M3 used 0.1–0.3 progression) |
| Command | `npm run package:production` |
| Artifact | `joblens-greenhouse-extension-v0.4.0.zip` + `.sha256` + `build-manifest-v0.4.0.json` |
| SHA-256 | `46c56dfbf984af697acdaa0a52d6d110f5bef3af9fc78bbb0f30e69b3110126e` |
| Hosts | Greenhouse boards + `api.joblens.app` / `joblens.app` only |
| Permissions | `activeTab`, `scripting`, `storage` |
| Dev origins in prod | **Forbidden** (package script fails closed) |

---

## Environment variables (production)

See `backend/.env.example` — notably `DATABASE_URL`, `EXTENSION_JWT_SECRET`, issuer/audience, allowed origins/IDs/versions, TTLs, feature flags, `EXTENSION_PILOT_USER_IDS`, `EXTENSION_OPS_TOKEN`.

Startup fails if production uses the development JWT secret or SQLite.

---

## Security controls

- JWT `iss` / `aud` + revocation  
- Min / blocked / allowlisted extension versions (426 update message)  
- Optional extension ID + origin allowlists  
- Feature flags + pilot allowlist (fill/upload gated in production)  
- Rate limits on auth, refresh, diagnostics, fill, upload, document retrieve, confirm, feedback  
- Structured audit without field values / document bytes / tokens  
- One-time document retrieval unchanged; reuse logged  
- Emergency revoke-all via ops token  

---

## Privacy & user docs

- `/privacy/extension` — disclosures + user control  
- `docs/EXTENSION_USER_GUIDE.md`  
- In-extension onboarding with required acknowledgments  
- In-extension **Report an issue** (non-sensitive metadata only)

---

## Feature flags (pilot defaults)

| Flag | Pilot |
|---|---|
| extension_enabled | true |
| diagnostics_enabled | true |
| assisted_fill_enabled | true for pilot users only (prod) |
| document_upload_enabled | true for pilot users only (prod) |
| submission_confirmation_enabled | true |
| greenhouse_enabled | true |
| automatic_submission_enabled | **false / absent** |

---

## Pilot

Checklist: `docs/PHASE5_M4_PILOT_CHECKLIST.md`  
**Execution this session:** not run (requires Postgres + packaged build + testers).

---

## Tests

| Suite | Status |
|---|---|
| Backend unit/integration (SQLite + PG) | **32 passed** (M1–M4; includes PG concurrent unique jti) |
| PostgreSQL migrate / downgrade smoke | **Pass** |
| Extension vitest | **23 passed** |
| Extension `package:production` | **OK** (checksum above) |
| Frontend typecheck / prod build | Recommended before pilot |

---

## Known limitations

1. ~~PostgreSQL live validation blocked by Docker Desktop engine.~~ **Cleared locally 2026-07-13.**  
2. Production API/frontend hostnames (`api.joblens.app` / `joblens.app`) must match real deploy URLs before store packaging.  
3. Malware scanning for uploads remains planned; pilot limited to trusted users + allowlisted MIME/size.  
4. Controlled pilot not yet executed — metrics TBD.  
5. SQLite→Postgres import is optional; tracker count drift (12 vs 13) expected until intentional reconciliation.  
6. Zero Greenhouse `application_url`s in inventory — pilot should use known Greenhouse boards / fixtures.

---

## Final recommendation

**CONDITIONAL GO** for a **closed Greenhouse pilot** — local Postgres gate is cleared; set deploy secrets + `EXTENSION_PILOT_USER_IDS`, then run [`docs/PHASE5_M4_PILOT_CHECKLIST.md`](./PHASE5_M4_PILOT_CHECKLIST.md).

**NO-GO** for Chrome Web Store / public release until the pilot completes with GO metrics and production secrets are configured.
