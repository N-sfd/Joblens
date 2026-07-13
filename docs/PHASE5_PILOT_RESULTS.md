# Phase 5 — Closed Greenhouse pilot results / readiness

**Date:** 2026-07-13  
**Scope:** Controlled human Greenhouse-only extension pilot  
**Store / public release:** **NO-GO** (no human pilot evidence yet)

---

## Verdict (current)

### **PAUSED — awaiting human tester (Step 2+)**

| Gate | Status |
|------|--------|
| Engineering M0–M5 | Complete |
| ATS auth smoke 13/13 | Complete |
| Environment verification (Step 1) | **PASS** |
| No-submit static / unit guarantees | **PASS** |
| Local extension build for localhost | **PASS** (`dist` development 0.4.0) |
| Human install / connect / checklist | **NOT STARTED** |
| Metrics from live sessions | **EMPTY baseline only** |
| Browser-store GO | **NO-GO** |

Pilot metrics and GO/NO-GO for **product pilot completion** will be filled only from real tester evidence. No fabricated checklist completion.

Full tester instructions: [`docs/PHASE5_PILOT_TESTER_GUIDE.md`](./PHASE5_PILOT_TESTER_GUIDE.md)

---

## Step 1 — Environment verification (2026-07-13)

| Check | Result |
|-------|--------|
| Backend `:8000` health | `{"status":"healthy"}` |
| Frontend `:3000` | HTTP 200 |
| PostgreSQL | `pg_isready` OK; `DATABASE_URL` → `127.0.0.1:5433/joblens` |
| Alembic | head = current = `j0e1f2a3b4c5` |
| `ENV` | `development` |
| Pilot flags | fill, upload, diagnostics, confirmation, greenhouse **enabled** |
| `automatic_submission_enabled` | **false** |
| `submit_application` capability | **false** |
| Pilot user id `1` | `is_pilot_user=True`; email `naziaasif1412@gmail.com` |
| Published Greenhouse jobs (API) | **7** (`X-Guest-Id` list) |
| Extension version accepted | `0.4.0` ≥ default min `0.3.0`; not blocked |
| Production zip | Present; **not** used for local pilot (no localhost hosts) |

### Blocker resolved for local pilot

Production packaged zip targets `https://api.joblens.app` and omits localhost host permissions. For this closed **local** pilot, testers must load the **development** unpacked build:

`browser-extension/dist` after `npm run build`  
(`build-info.json`: `"build":"development"`, `apiOrigin: http://localhost:8000`)

Permissions remain Greenhouse + localhost JobLens only — **no** `<all_urls>`.

---

## No-submit / safety audit (pre-human)

| Check | Result |
|-------|--------|
| `SUBMIT_APPLICATION` in extension message contract | Absent (test passed) |
| Backend `submit_application` | Always false |
| `automatic_submission_enabled` | Always false |
| Popup copy | Explicit “JobLens will not click Submit” |
| fillEngine / uploadEngine | Documented never click submit |

Any runtime submit interaction during human pilot = **critical failure → NO-GO**.

---

## Pilot scope

- Greenhouse only  
- Pilot users only (local: user id `1`; add more via `EXTENSION_PILOT_USER_IDS`)  
- User-controlled extension  
- No silent submit / CAPTCHA / login automation / employer creds / headless / multi-platform  

---

## Users

| Tester | JobLens user id | Status |
|--------|-----------------|--------|
| Primary | 1 | Environment ready; connect not yet confirmed |

---

## Jobs / forms tested (human)

None yet. Recommended set in the tester guide (public / Discord / Figma boards).

---

## Metrics

Baseline file: [`docs/PHASE5_M5_PILOT_METRICS.json`](./PHASE5_M5_PILOT_METRICS.json) (zeros — no live fill/upload sessions).

Human tallies (detection, mapping scores, undo, confusion) will be merged after tester reports.

Required zeros after human pilot (must remain 0):

- `sensitive_fields_filled`
- `legal_fields_filled`
- `submit_button_interactions`

---

## Findings (pending human)

Detection / mapping / fill / upload / undo / submission-confirmation / auth / security / privacy / feedback: **TBD**

---

## Defects

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| P0-LOCAL-HOST | Medium (ops) | Production zip cannot run against localhost API | Mitigated: use development `dist` for local pilot; keep prod zip for store |

---

## Recommendations

| Decision | Current |
|----------|---------|
| Start human closed pilot | **GO** (env ready) |
| Pilot product verdict | **Pending human checklist** |
| Chrome Web Store release | **NO-GO** |

---

## Scripts / packages

| Artifact | Purpose |
|----------|---------|
| `backend/scripts/ats_auth_smoke.py` | Auth smoke |
| `backend/scripts/seed_greenhouse_jobs.py` | Greenhouse inventory |
| `backend/scripts/m5_pilot_metrics.py` | Aggregate metrics |
| `browser-extension/dist` | **Local pilot** load-unpacked |
| `joblens-greenhouse-extension-v0.4.0.zip` | Production package (store / remote API) |
