# Phase 5 — Milestone M5 Report

**Date:** 2026-07-13  
**Scope:** Pilot enablement, operator metrics, production cutover + store readiness docs.  
**Not in scope:** Silent submit, auto Submit, CAPTCHA bypass, employer credentials, multi-platform, broad public upload without malware scanning.

---

## Verdict

### **CONDITIONAL GO — run the closed pilot, then decide public release**

M5 delivers the operator/pilot tooling and cutover documentation needed after the M4 Postgres gate.

**Public / Chrome Web Store remains NO-GO** until:

1. Controlled pilot (3–5 testers) completes with acceptable metrics  
2. Production secrets + `EXTENSION_PILOT_USER_IDS` (or post-pilot widen policy) configured on deploy  
3. Store checklist completed (`docs/PHASE5_M5_STORE_CHECKLIST.md`)  
4. Malware-scan plan accepted before opening uploads beyond trusted pilot users  

---

## Files created

| Path | Purpose |
|---|---|
| `backend/services/pilot_metrics.py` | Non-sensitive aggregate metrics |
| `backend/routers/extension_pilot.py` | `/pilot/me` + ops metrics endpoints |
| `backend/scripts/m5_pilot_metrics.py` | CLI metrics report |
| `backend/tests/test_m5_pilot.py` | Entitlement + metrics tests |
| `docs/PHASE5_M5_STORE_CHECKLIST.md` | Web Store submission checklist |
| `docs/PHASE5_M5_PRODUCTION_CUTOVER.md` | Deploy cutover runbook |
| `docs/PHASE5_M5_MALWARE_SCAN_PLAN.md` | Pre-public upload scanning plan |
| `docs/PHASE5_M5_REPORT.md` | This report |

## Files modified

| Path | Change |
|---|---|
| `backend/main.py` | Register `extension_pilot` router |
| `browser-extension/src/shared/api.ts` | Status types, `fetchPilotMe`, 426 handling |
| `browser-extension/src/popup/popup.ts` | Pilot entitlement messaging |
| `docs/PHASE5_ASSISTED_APPLICATION_SCOPING.md` | M5 gate note |

---

## New APIs

| Method | Path | Auth |
|---|---|---|
| GET | `/api/extension/pilot/me` | Extension bearer |
| POST/GET | `/api/extension/ops/pilot-metrics` | `EXTENSION_OPS_TOKEN` |

Metrics never include field values, document bytes, or tokens.

```bash
cd backend
python scripts/m5_pilot_metrics.py --database-url postgresql://joblens:joblens@127.0.0.1:5433/joblens
```

---

## Pilot execution (human)

Follow [`docs/PHASE5_M4_PILOT_CHECKLIST.md`](./PHASE5_M4_PILOT_CHECKLIST.md) and cutover [`docs/PHASE5_M5_PRODUCTION_CUTOVER.md`](./PHASE5_M5_PRODUCTION_CUTOVER.md).

After each day of pilot:

```bash
python scripts/m5_pilot_metrics.py --since-hours 24
```

Collect tester scores for mapping accuracy / undo (not automatable without collecting answer content).

---

## Tests

| Suite | Expected |
|---|---|
| `tests/test_m5_pilot.py` | Entitlement + ops metrics |
| Prior extension M1–M4 | Still green |

---

## Final recommendation

**CONDITIONAL GO** to **execute the closed Greenhouse pilot**.  
**NO-GO** for public store release until pilot metrics support GO and cutover/store checklists are complete.

### Readiness update (2026-07-13)

Auth smoke + Greenhouse URL seed + local pilot config completed. See [`docs/PHASE5_PILOT_RESULTS.md`](./PHASE5_PILOT_RESULTS.md). Human checklist execution remains before any store GO.
