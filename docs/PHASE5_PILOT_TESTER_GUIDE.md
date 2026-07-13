# Phase 5 — Closed Greenhouse pilot: tester instructions

**Status:** Environment verified. **Human tester action required** from Step 2 onward.  
**Do not** use the production zip against localhost — it only talks to `api.joblens.app`.

---

## Environment (verified 2026-07-13)

| Check | Result |
|-------|--------|
| API `http://127.0.0.1:8000/health` | healthy |
| Frontend `http://localhost:3000` | 200 |
| Postgres `127.0.0.1:5433` | ready; Alembic head `j0e1f2a3b4c5` |
| Pilot user | JobLens `users.id=1` (`naziaasif1412@gmail.com`) |
| Caps for user 1 | fill/upload/confirm **on**; `submit_application=false` |
| Auto submit | **false** (absent as a feature) |
| Published Greenhouse jobs | **7** via public jobs API |
| Extension for **local** pilot | Unpacked `browser-extension/dist` **development** build `0.4.0` (localhost hosts) |
| Production zip `v0.4.0` | Keep for store packaging only — **not** for this local pilot |

No-submit code audit (automated): message contract has no `SUBMIT_APPLICATION`; flags force `submit_application=false`; 6 related tests passed.

---

## Step 2 — Install and connect (do this now)

### A. Load the local extension

1. Confirm `e:\projects\AI Projects\JobLens\browser-extension\dist\build-info.json` shows `"build": "development"` and `apiOrigin` `http://localhost:8000`.
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right).
4. Click **Load unpacked**.
5. Select folder:  
   `e:\projects\AI Projects\JobLens\browser-extension\dist`  
   (not the zip; not `src`)
6. Confirm version **0.4.0** and name **JobLens Application Assist**.

### B. Sign in to JobLens as pilot user 1

1. Open `http://localhost:3000`
2. Sign in so you are JobLens account **user id 1** (email associated with that account).
3. Complete profile if empty: name, email, phone, location, LinkedIn (optional).
4. Upload a **resume** (PDF preferred) and a **cover letter** if available (Settings / Documents / ApplyPilot profile — use existing JobLens document UI).

### C. Connect the extension

1. Click the extension icon → **Connect** / Start connection.
2. Chrome should open JobLens `/extension/connect?challenge=…`.
3. Click **Confirm extension connection**.
4. Return to the popup — status should show **Connected** / pilot enabled.
5. Tokens must **not** appear in the popup UI (only status).

### D. Quick revoke check (after first connect)

1. In the popup, **Disconnect**.
2. Confirm status is disconnected.
3. Connect again before form tests.

**When finished with Step 2**, reply in chat: `Connected as user 1` (or report the exact error). Do not continue Steps 3–16 until connect works.

---

## Step 3 — Recommended pilot jobs (Discover / direct URL)

Use **sanitized / non-committed** apply pages first. Open the Greenhouse URL; **do not click employer Submit** unless you intentionally want to apply.

| Priority | JobLens id | Title | URL | Why |
|----------|------------|-------|-----|-----|
| 1 | 3 or 4 | Senior Python / Accounting Manager board | https://job-boards.greenhouse.io/public/jobs/7720156003 | Personal info + resume + cover letter + LinkedIn/portfolio + work auth + sponsorship + custom |
| 2 | 9 | Product Manager | https://job-boards.greenhouse.io/public/jobs/7802674003 | Similar + sponsorship |
| 3 | 5 | Account Executive - Tech (Discord) | https://job-boards.greenhouse.io/discord/jobs/8433948002 | Sensitive + custom (7 each) + resume/cover |
| 4 | 8 | Account Executive, Enterprise (Figma) | https://boards.greenhouse.io/figma/jobs/5426468004?gh_jid=5426468004 | Resume + LinkedIn/portfolio + custom; some unknown fields |
| 5 | 7 | Figma Berlin AE | https://boards.greenhouse.io/figma/jobs/5364702004?gh_jid=5364702004 | Resume only (no cover) + custom |

Discover: `http://localhost:3000/jobs/discover` (guest header / signed-in session as usual).

---

## Steps 4–13 — Checklist (human)

Follow every applicable step in [`PHASE5_M4_PILOT_CHECKLIST.md`](./PHASE5_M4_PILOT_CHECKLIST.md) and the field-level checks in the pilot brief (detection → mapping → fill → upload → undo → no-submit → I Submitted → Application Status → auth/security).

### Per-job log template (copy for each job)

```text
Job ID:
Employer / board:
Application URL:
Form type notes:
Extension version: 0.4.0
Detector version:
Fill-engine version:
Tester ID: 1
Test date:
Detection OK? (Y/N)  FP/FN:
Mapping: correct / incorrect / missing / ambiguous:
Fill: selected filled / preserved / failures:
Upload resume: attempt / success / fallback:
Upload cover: attempt / success / fallback:
Undo: attempt / success:
Submit button clicked by extension? (must be N):
I Submitted / In Progress tested? (Y/N):
Application Status notes:
Issues:
```

### Hard fail (stop and report immediately)

- Extension clicks or triggers employer **Submit**
- Sensitive or legal fields filled without explicit approval
- Cross-user document/session access
- Tokens visible in UI/logs
- Applied status without “I Submitted” confirmation

---

## Steps 14–17 — Metrics and verdict (after human runs)

After you complete at least one full checklist pass, paste the per-job logs (or say “pilot day 1 complete”). Then we will:

1. Run `python scripts/m5_pilot_metrics.py --since-hours 24`
2. Update `docs/PHASE5_M5_PILOT_METRICS.json` with tester tallies
3. Update `docs/PHASE5_PILOT_RESULTS.md` with GO / Conditional GO / NO-GO  
   (**Store remains NO-GO** until human evidence supports release criteria.)

---

## Pause

**Next human action:** Load unpacked `browser-extension\dist` (development build), sign in as user 1, connect the extension, reply when Connected.
