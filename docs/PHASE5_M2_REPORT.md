# Phase 5 — Milestone M2 Report

**Date:** 2026-07-14  
**Scope:** Greenhouse assisted fill for supported **non-upload** fields only.  
**Not in scope:** Resume/cover upload, submit, CAPTCHA, login, multi-platform, headless.

---

## Verdict

### **CONDITIONAL GO → M3 (optional upload assist / post-submit confirm UX)**

M2 development exit criteria are met for local/fixture testing.

**Production rollout still blocked** until PostgreSQL inventory + migrations (`g7b8c9d0e1f2`, `h8c9d0e1f2a3`) are verified on `:5433`.

**M3** may add optional **user-triggered** resume upload assist and clearer Application Status confirm-submit — still **no** silent submit.

---

## Files created

| Path | Purpose |
|---|---|
| `backend/services/extension_fill.py` | Profile→field mapping (minimized) |
| `backend/migrations/versions/h8c9d0e1f2a3_add_extension_fill_sessions.py` | Fill-session table |
| `backend/tests/test_extension_m2.py` | Fill-session / ownership / status tests |
| `browser-extension/src/shared/fillEngine.ts` | Native fill + undo + emptiness probe |
| `browser-extension/tests/fill_m2.test.ts` | Fixture fill / overwrite / select tests |
| `docs/PHASE5_M2_REPORT.md` | This report |

## Files modified

| Path | Change |
|---|---|
| `backend/models.py` | `ExtensionFillSession` |
| `backend/routers/extension.py` | `/fill-session/{start,map,result}` |
| `backend/services/extension_auth.py` | Scope `extension:assist` (+ legacy diagnostics) |
| `backend/auth.py` | Guest migrate fill sessions |
| `backend/tests/test_extension_m1.py` | `fill_form: true` expectation |
| `browser-extension/src/types/messages.ts` | M2 message types, v0.2.0 |
| `browser-extension/src/content.ts` | Fill / undo / probe handlers |
| `browser-extension/src/shared/api.ts` | Fill-session client |
| `browser-extension/src/popup/popup.ts` | Consent → readiness → mapping → fill result |
| `browser-extension/manifest.json` | Version 0.2.0 |
| `docs/PHASE5_ASSISTED_APPLICATION_SCOPING.md` | M2 note (via prior + this report) |

---

## Manifest permissions

**No new permissions.** Still: `activeTab`, `scripting`, `storage`, Greenhouse hosts + localhost JobLens/API.

---

## Backend endpoints (M2)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/extension/fill-session/start` | Creates session; returns readiness + permitted fields |
| POST | `/api/extension/fill-session/map` | Returns mappings + approved values (not stored on session) |
| POST | `/api/extension/fill-session/result` | Field **names** only; updates tracker status |

---

## Database migration

**`h8c9d0e1f2a3`** → table `extension_fill_sessions`  
Stores field-name JSON lists and statuses — **not** profile values or employer form values.

```bash
cd backend && python -m alembic upgrade head
```

---

## Fill-session model

Statuses: `created` → `awaiting_review` → `filled` / `partially_filled` / `failed` / `expired`  
Columns: detected/requested/approved/successful/skipped/failed/missing field-name JSON, versions, timestamps, `expires_at` (30m).

---

## Profile fields supported / excluded

**Fillable:** first/last/full name, email, phone, city/state/country/postal, linkedin/portfolio/github, current_company/title; work_authorization & sponsorship_required **only if** `user_confirmed`.

**Never auto-filled:** uploads, sensitive demographics, legal attestations, custom questions, salary/clearance, CAPTCHA, passwords, signatures.

---

## Consent / mapping / existing values / undo

1. Analyze consent (tab session)  
2. Fill-prepare consent → Review Fields  
3. Mapping review with checkboxes; work-auth/sponsor need **individual** confirm  
4. Existing values → Already Filled; optional per-field Replace  
5. **Fill Selected Fields** required before DOM mutation  
6. Undo restores prior states from content-script memory only  

---

## Application Status

After result: if tracker `job_id` set and status not protected → `Application In Progress` (from Saved / Application Opened).  
Never downgrades Applied / Interviewing / Offer / Rejected / Withdrawn.  
Activity: counts only. Action-required when manual fields remain.

---

## Fixtures & tests

| Suite | Result |
|---|---|
| Extension vitest (M1+M2) | **18 passed** |
| Backend `test_extension_m1` + `m2` | **11 passed** |
| Full backend suite | run after this report |

Fixtures: all three M0 HTML forms exercised for no-submit / no-upload fill.

---

## PostgreSQL inventory status

**Still pending** (Docker engine unavailable). Required before production rollout.

---

## Security findings

| Item | Status |
|---|---|
| No submit / no upload fill | Enforced in fill engine + API capabilities |
| Employer values not sent to backend | Emptiness probes are booleans only |
| Session stores names not values | Verified in tests |
| Sensitive/legal/custom excluded | Mapping statuses |
| Short-lived assist tokens | `extension:assist` |

---

## Known limitations

1. Guest accounts have no Profile → mapping mostly Missing / Not Ready  
2. Embedded employer-domain Greenhouse still out of host scope  
3. Tracker `job_id` must be supplied by caller for status updates (URL-only fills won’t auto-create tracker yet)  
4. Production API hosts still need packaging swap from localhost  

---

## Updated recommendation for M3

| Decision | Outcome |
|---|---|
| M2 | **Complete** for local/fixture assisted fill |
| **M3** | **Conditional GO** — user-confirmed resume upload assist + “I submitted” confirm → Applied; still no silent submit |
| **NO-GO** | Auto-submit, CAPTCHA bypass, multi-platform, employer creds, headless |
