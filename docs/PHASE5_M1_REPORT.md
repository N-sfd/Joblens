# Phase 5 — Milestone M1 Report

**Date:** 2026-07-14  
**Scope:** JobLens browser-extension shell + secure read-only Greenhouse detection.  
**Not in scope:** Autofill, resume/cover upload, form submit, CAPTCHA, multi-platform, headless apply.

---

## Verdict

### **CONDITIONAL GO → M2 (assisted fill of supported fields only)**

M1 engineering exit criteria are met for the extension shell, consent, detector, auth, diagnostics, and tests.

**Still blocking production rollout (unchanged from M0):**

- PostgreSQL M0 inventory (Docker Desktop engine unavailable on this machine)
- Apply Alembic head on Postgres (`g7b8c9d0e1f2`) before production
- Package host permissions must include the deployed JobLens API origin (not `<all_urls>`)

**GO to M2 design/implementation** only under: Greenhouse only, user submits, no silent submit, fill only M0 supported non-upload fields after explicit user action.

---

## Files created

### Extension (`browser-extension/`)

| Path | Purpose |
|---|---|
| `manifest.json` | MV3, minimal permissions |
| `package.json`, `tsconfig.json`, `vitest.config.ts` | Build / strict TS / tests |
| `scripts/build.mjs`, `scripts/package.mjs` | esbuild + zip |
| `src/background.ts` | Auth polling, open JobLens |
| `src/content.ts` | On-demand read-only analyze |
| `src/popup/*` | Consent, privacy, summary, field details |
| `src/shared/greenhouseDetector.ts` | M0 detector port |
| `src/shared/api.ts` | Auth + diagnostics client |
| `src/types/messages.ts` | Message contract |
| `src/utils/url.ts` | Greenhouse URL gate |
| `tests/detector.test.ts` | Fixture + classification tests |
| `public/icons/*` | Icons |
| `README.md` | Dev load instructions |

### Backend

| Path | Purpose |
|---|---|
| `backend/routers/extension.py` | Auth + diagnostics API |
| `backend/services/extension_auth.py` | Challenge + JWT + revoke |
| `backend/migrations/versions/g7b8c9d0e1f2_add_extension_m1_tables.py` | Migration |
| `backend/tests/test_extension_m1.py` | Auth/ownership tests |

### Frontend

| Path | Purpose |
|---|---|
| `frontend/src/app/(app)/extension/connect/*` | Confirm extension connection |
| `frontend/src/app/(app)/extension/report-site/*` | Unsupported-site report |

### Docs

| Path | Purpose |
|---|---|
| `docs/PHASE5_M1_REPORT.md` | This report |

## Files modified

| Path | Change |
|---|---|
| `backend/models.py` | `ExtensionAuthChallenge`, `ExtensionToken`, `ExtensionDiagnostic` |
| `backend/main.py` | Register `/api/extension` |
| `backend/auth.py` | Migrate guest extension rows on signup |

---

## Manifest permissions

| Item | Value |
|---|---|
| `permissions` | `activeTab`, `scripting`, `storage` |
| `host_permissions` | `boards.greenhouse.io`, `job-boards.greenhouse.io`, localhost JobLens + API (dev) |
| Explicitly **not** requested | browsingHistory, tabs*, cookies, downloads, webRequest, debugger, `<all_urls>` |

\*No broad `tabs` permission — only `activeTab` after user gesture.

**Note:** Production packaging must replace localhost hosts with the real JobLens web/API origins. Do not expand to `<all_urls>`. Embedded employer-domain Greenhouse (`gh_jid`) still needs a documented permission expansion before support.

---

## Backend endpoints

| Method | Path | Auth |
|---|---|---|
| POST | `/api/extension/auth/start` | Public (creates challenge) |
| POST | `/api/extension/auth/confirm` | `get_owner` (cookie / guest) |
| POST | `/api/extension/auth/exchange` | Public (one-time token pickup) |
| POST | `/api/extension/auth/refresh` | Refresh token |
| POST | `/api/extension/auth/revoke` | Refresh token |
| GET | `/api/extension/auth/challenge/{challenge}` | Public status |
| GET | `/api/extension/status` | Extension Bearer |
| POST | `/api/extension/diagnostics` | Extension Bearer |
| GET | `/api/extension/diagnostics/{id}` | Extension Bearer + ownership |

---

## Database migration

**Revision:** `g7b8c9d0e1f2` (revises `f6a7b8c9d0e1`)

| Table | Purpose |
|---|---|
| `extension_auth_challenges` | Pairing codes; pending tokens cleared after exchange |
| `extension_tokens` | Revocable credentials (SHA-256 hashes only) |
| `extension_diagnostics` | Field definitions JSON — **no answer values** |

```bash
cd backend
python -m alembic upgrade head
```

No `application_attempts` / autofill / form-answer tables in M1.

---

## Authentication flow

1. Extension generates `challenge` → `POST /auth/start`
2. Opens `/extension/connect?challenge=…`
3. User confirms → `POST /auth/confirm` binds Owner + issues token pair into challenge row
4. Extension polls `POST /auth/exchange` → receives access (15m) + refresh (7d) once
5. Access JWT: `typ=extension`, `scope=extension:diagnostics`, `jti` tied to DB row
6. Revoke marks row `revoked_at`; subsequent API calls → 401

Tokens are not Clerk ATS credentials and do not expose IdP cookies.

---

## Message contract

Validated types: `DETECT_PLATFORM`, `ANALYZE_FORM`, `FORM_ANALYSIS_RESULT`, `OPEN_JOBLENS`, `AUTH_START`, `AUTH_SUCCESS`, `AUTH_EXPIRED`, `SAVE_DIAGNOSTIC`, `GET_STATUS`, `ERROR`.

Runtime validation via `parseExtensionMessage` — unknown types rejected.

---

## Greenhouse pages & fixtures tested

| Source | Result |
|---|---|
| `form_acme_software_engineer.html` | Greenhouse + supported/sensitive/uploads |
| `form_northwind_designer.html` | Required cover letter + sensitive/unsupported |
| `form_contoso_analyst.html` | full_name / work auth |
| Live boards (M0 samples) | Still valid for API JSON path (backend M0) |

URL gate: only `boards.greenhouse.io` and `job-boards.greenhouse.io` in the extension.

---

## Fields detected / data handling

**Detected (structure only):** labels, types, required, select option labels, upload purpose, classifications, confidence.

**Collected / transmitted (with consent + Connect):** normalized URL, platform, employer, title, field definitions, counts, detector/extension versions.

**Explicitly not collected:** entered values, passwords, cookies, history, CAPTCHA, resume/cover contents, employer auth, full HTML.

---

## Tests

| Suite | Result |
|---|---|
| `browser-extension` vitest | **8 passed** |
| `backend/tests/test_extension_m1.py` | **6 passed** (included in full suite) |
| Full `backend/tests/` | **54 passed** |

Covers: Greenhouse/non-Greenhouse URLs, fixtures, required/upload/sensitive/custom/legal, no mutation / no values, message schema, revoke, ownership isolation, refresh rotation.

---

## PostgreSQL inventory status

**Still unavailable** — Docker Desktop Linux engine not running (`connection refused` / pipe missing on `:5433`).

SQLite M0 counts remain as in `PHASE5_M0_REPORT.md`. Re-run when Docker is up:

```bash
docker compose -f docker-compose.postgres.yml up -d
cd backend
python -m alembic upgrade head
python scripts/m0_backfill_and_report.py
```

Then update `PHASE5_M0_REPORT.md` PostgreSQL section before production extension rollout.

---

## Security findings

| Finding | Severity | Notes |
|---|---|---|
| Read-only content script | OK | No value reads; structural fingerprint guard |
| Consent per tab session | OK | `chrome.storage.session`, not permanent |
| Extension JWT scoped + revocable | OK | Hashes at rest; short access TTL |
| Host permissions limited | OK | No `<all_urls>` |
| Diagnostics ownership 404 | OK | Cross-user isolation tested |
| Pending tokens on challenge row | Low | Cleared on exchange; challenge expires 10m — acceptable for M1 |
| Localhost hosts in manifest | Info | Must swap for production origins |

---

## Known limitations

1. Embedded Greenhouse on employer domains not supported (no host permission).
2. Dynamic multi-iframe Greenhouse apps may need longer wait / optional observer in M2.
3. Production API/web origins not yet parameterized in the packaged manifest.
4. PostgreSQL inventory pending.
5. No Chrome Web Store listing yet (dev unpacked / zip only).

---

## Manual test checklist

1. `cd browser-extension && npm run build`
2. Chrome → Load unpacked → `browser-extension/dist`
3. Open a Greenhouse job board or local fixture HTTP server
4. Open extension → consent → Analyze
5. Confirm platform Greenhouse; fields categorized; page unchanged
6. Connect → confirm on JobLens → diagnostic save
7. Second guest cannot GET diagnostic
8. Disconnect / revoke → old token 401
9. Unsupported site shows prescribed message + actions
10. `npm run package` → `joblens-extension-m1.zip`

---

## Updated recommendation for M2

| Decision | Outcome |
|---|---|
| M1 | **Complete** (Postgres inventory still pending for prod) |
| **M2** | **Conditional GO** — assisted fill of **supported non-upload** fields only, after explicit user action; user submits |
| **NO-GO** remains | Silent submit, CAPTCHA bypass, employer creds, headless, multi-platform, auto resume upload without separate consent milestone |
