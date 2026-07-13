# Phase 5 — Milestone M0 Report

**Date:** 2026-07-14  
**Scope:** Instrumentation, URL classification, Greenhouse fixtures, read-only detector, reports, tests.  
**Not in scope:** Production autofill adapter, field filling, submission, multi-platform adapters.

---

## Verdict

### **CONDITIONAL GO → M1 (extension scaffolding / assist UX design)**

M0 exit criteria are met for engineering readiness. Local JobLens ATS inventory still has **zero Greenhouse `application_url`s**, so live volume remains a product risk. Proceed to M1 under the approved Conditional GO constraints (Greenhouse only, user-controlled extension, user submits, no silent submit / CAPTCHA bypass / employer credentials / headless apply).

**PostgreSQL report:** completed 2026-07-13 after Docker Desktop start.

```bash
cd backend
python scripts/m0_backfill_and_report.py --database-url postgresql://joblens:joblens@127.0.0.1:5433/joblens
python scripts/m4_postgres_validate.py --create-test-db --migrate --downgrade-smoke
```

### M4 PostgreSQL status (2026-07-13)

| Item | Value |
|---|---|
| PostgreSQL version | **16.13** (postgres:16-alpine) |
| Database | `joblens` (app) / `joblens_test` (tests) |
| Host / port | `127.0.0.1:5433` (container listens 5432) |
| Migration head | **`i9d0e1f2a3b4`** (matches) |
| Downgrade smoke (`joblens_test`) | **Pass** (downgrade → `h8c9d0e1f2a3` → upgrade head) |
| Backup | Docker volume `joblens_pgdata`; production uses provider backups |
| Live validation | **Complete** |

### PostgreSQL inventory (after backfill)

| Metric | PostgreSQL | SQLite (local) | Notes |
|---|---:|---:|---|
| Total job requirements | 2 | 2 | Match |
| Jobs with application URLs | 0 | 0 | Match |
| Recruiter-contact-only | 1 | 1 | Match |
| By platform | unknown:1, recruiter_email:1 | same pattern | Match |
| Invalid URLs | 0 | 0 | Match |
| Unknown with URL | 0 | 0 | Match |
| Lost URLs | 0 | 0 | Match |
| Greenhouse jobs | 0 | 0 | Still no live Greenhouse volume |
| Published jobs | 0 | 0 | Match |
| Saved tracker (`job_applications`) | 12 | 13 | **Expected minor drift** — PG volume older/partial vs SQLite tracker |
| Application documents | 0 | 0 | Match |
| Extension sessions / diagnostics / tokens | 0 | 0 | Match — tokens not migrated by design |

**Expected differences:** Fresh or partially populated Postgres volumes will not mirror every SQLite tracker row; extension tokens/challenges/upload sessions are never imported from SQLite. Zero Greenhouse `application_url`s remains a product risk, not a migration failure.

**Unexpected differences:** Tracker count 12 vs 13 — investigate only if production cutover requires exact parity; use `scripts/m4_sqlite_to_postgres.py --dry-run` before any intentional import.

---

## Exit criteria checklist

| Criterion | Status |
|---|---|
| `application_url` survives Zoho extract → CRM/ATS → public API → import → Discover → Details → Tracker → Application Status | **Met** (normalized + platform on create/update/parse/public detail/snapshot/`job_url`) |
| SQLite report complete | **Met** |
| PostgreSQL report when available | **Waived / pending** (engine down; soft-fail documented) |
| ≥5 Greenhouse forms from ≥3 employers analyzed | **Met** (6 API samples: public, discord, figma) |
| Sanitized HTML fixtures | **Met** (3 forms) |
| Read-only detector finds supported fields | **Met** |
| Sensitive / unsupported flagged | **Met** |
| No fill / submit | **Met** (detector + tests assert) |
| Tests pass | **Met** (48 backend tests; 17 M0-specific) |
| Final GO / NO-GO | **Conditional GO to M1** |

---

## Files created

| Path | Purpose |
|---|---|
| `backend/services/application_url.py` | Normalize URLs, strip tracking params, classify platform |
| `backend/services/greenhouse_detector.py` | Read-only Greenhouse field detector |
| `backend/scripts/m0_backfill_and_report.py` | Backfill `application_platform` + dual DB report |
| `backend/migrations/versions/f6a7b8c9d0e1_add_application_platform.py` | Alembic: `job_requirements.application_platform` |
| `backend/tests/test_m0_application_url.py` | M0 automated tests |
| `backend/fixtures/greenhouse/sample_*.json` (6) | Live Job Board API samples (3 boards) |
| `backend/fixtures/greenhouse/form_*.html` (3) | Sanitized HTML fixtures |
| `docs/PHASE5_M0_REPORT.md` | This report |

## Files modified

| Path | Change |
|---|---|
| `backend/models.py` | `application_platform` column + response/parse schemas |
| `backend/database.py` | `_ensure_columns` for SQLite bootstrap |
| `backend/services/claude_service.py` | Parse prompt + post-parse URL recover/classify |
| `backend/routers/job_requirements.py` | Classify on create/update; return platform |
| `backend/routers/public_jobs.py` | Public detail includes `application_platform` |
| `backend/routers/jobs.py` | Normalize on Apply Now; copy URL into tracker/`job_url` |
| `backend/routers/applications.py` | `has_application_url` checks snapshot |
| `frontend/src/types/index.ts` | `application_platform` on job / parse types |
| `docs/PHASE5_ASSISTED_APPLICATION_SCOPING.md` | M0 completion note (see below) |

## Migration

- **Revision:** `f6a7b8c9d0e1_add_application_platform`
- **Revises:** `e5f6a7b8c9d0`
- **Adds:** `job_requirements.application_platform VARCHAR(50)` + index
- **Apply:** `cd backend && python -m alembic upgrade head`

No `application_attempts` tables in M0.

---

## URL classification rules

Central module: `backend/services/application_url.py`

1. Reject empty / malformed / non-http(s) / unsafe schemes (`javascript`, `data`, `file`, …).
2. `mailto:` → `recruiter_email` (not a web apply URL).
3. Strip tracking query params (`utm_*`, `fbclid`, `gclid`, …); keep `gh_jid` / meaningful Greenhouse params.
4. Host/path heuristics → platform label:

| Platform | Signals (summary) |
|---|---|
| `greenhouse` | `greenhouse.io`, `gh_jid`, Greenhouse embed hosts |
| `lever` | `lever.co` / Lever job hosts |
| `workday` | `myworkdayjobs.com`, Workday paths |
| `workable` | `workable.com` apply hosts |
| `ashby` | `ashbyhq.com` |
| `smartrecruiters` | SmartRecruiters hosts |
| `icims` | iCIMS hosts |
| `linkedin` | `linkedin.com/jobs` |
| `company_careers` | `/careers`, `/jobs`, `careers.*` hubs without known ATS |
| `recruiter_email` | mailto or email-only (no URL) |
| `generic_form` | Google Forms / similar form hosts |
| `unknown` | Valid URL without matching rules, or unclassifiable |

---

## SQLite platform counts

Source: `python scripts/m0_backfill_and_report.py` against `backend/aijob.db`

| Metric | Value |
|---|---|
| Total jobs (`job_requirements`) | 2 |
| Jobs with application URLs | 0 |
| Recruiter-contact-only | 1 |
| Neither URL nor recruiter | 1 |
| Invalid URLs | 0 |
| Unknown with URL | 0 |
| URLs lost (text had ATS URL, field empty) | 0 |
| **Counts by platform** | `unknown`: 1, `recruiter_email`: 1 |
| **Tracker URL platforms** | `company_careers`: 10, `unknown`: 1, `linkedin`: 1 |
| Backfill idempotency | `updated`: 0 on re-run, `second_pass_changes`: 0 |

**Greenhouse in inventory:** 0

---

## PostgreSQL platform counts

| Metric | Value |
|---|---|
| Available | **No** |
| Error | `OperationalError` — connection refused `127.0.0.1:5433` (Docker Desktop Linux engine not running) |
| Counts | *N/A — re-run when Postgres is up* |

Script soft-fails Postgres and still emits a complete SQLite section.

---

## Greenhouse samples analyzed

| Sample | Board / employer | Role (title) | Notes |
|---|---|---|---|
| `sample_public_7720156003.json` | public | Accounting Manager | ≥14 questions; name/email/phone/resume/cover/LinkedIn |
| `sample_public_7802674003.json` | public | Product Manager | Same board, second role |
| `sample_discord_8433948002.json` | discord | Account Executive - Tech | 25 fields; uploads + LinkedIn/portfolio |
| `sample_discord_8599937002.json` | discord | Account Manager, Advertising | Same board |
| `sample_figma_5364702004.json` | figma | Account Executive (Berlin) | Work authorization present |
| `sample_figma_5426468004.json` | figma | Account Executive, Enterprise | Portfolio + work auth |

**Employers / boards:** 3 (`public`, `discord`, `figma`)  
**Forms analyzed:** 6 (≥5 required)

---

## Fixture coverage (sanitized HTML)

| Fixture | Coverage |
|---|---|
| `form_acme_software_engineer.html` | first/last, email, phone, location (city/state/country/postal), LinkedIn, portfolio, GitHub, company/title, resume, optional cover letter, work auth, sponsorship, custom + sensitive + legal, select/radio/checkbox/textarea |
| `form_northwind_designer.html` | first/last, email, phone, resume, **required** cover letter, LinkedIn, sensitive (veteran), unsupported (salary) |
| `form_contoso_analyst.html` | full_name, email, resume, work auth, sponsorship, custom |

---

## Supported fields detected (M0 normalize set)

Reliably mapped across fixtures / API samples:

- `first_name`, `last_name`, `full_name`
- `email`, `phone`
- `city`, `state`, `country`, `postal_code` (HTML fixtures; API samples vary)
- `linkedin_url`, `portfolio_url`, `github_url`
- `current_company`, `current_title`
- `resume_upload`, `cover_letter_upload` (optional vs required depends on form)
- `work_authorization`, `sponsorship_required`

All other questions classified as: `custom_question` | `sensitive_question` | `legal_attestation` | `unsupported` | `unknown`.

### Unreliable / deferred fields

| Area | Why |
|---|---|
| Location as single free-text vs split city/state | Label variance across boards |
| Cover letter as textarea vs file upload | Both appear; normalize to upload key only when file control |
| Work auth / sponsorship wording | Many phrasings; pattern-based |
| Custom “Why are you interested?” | Always `custom_question` — out of M0 autofill |
| EEO / gender / veteran / disability | `sensitive_question` — must not auto-fill |
| Salary expectations | `unsupported` |
| Multi-page / login-gated Greenhouse flows | Not covered by static fixtures |

---

## Tests

| Suite | Result |
|---|---|
| `tests/test_m0_application_url.py` | **17 passed** |
| Full `backend/tests/` | **48 passed** |

Coverage includes: Greenhouse / non-Greenhouse / LinkedIn / careers / recruiter-only / unsafe schemes / malformed URLs / normalization / tracking-param removal / backfill idempotency / fixture detection / sensitive classification / no fill side effects / public + tracker pipeline persistence.

---

## Security findings

| Finding | Severity | Notes |
|---|---|---|
| Detector is read-only | OK | No DOM mutation, upload, click, or submit APIs |
| Unsafe URL schemes rejected | OK | Prevents `javascript:` / `data:` / `file:` apply links |
| No employer credential storage | OK | M0 has no auth vault |
| No headless apply | OK | No server POST to Greenhouse apply endpoints |
| Sensitive questions flagged, not filled | OK | EEO / veteran / etc. |
| Tracking params stripped on persist | OK | Reduces PII leakage into shared URLs |
| Fixtures sanitized | OK | No real candidate PII in HTML fixtures |
| Extension not built yet | N/A | M1+ must keep minimal permissions; no unrelated-tab reads |

---

## Updated recommendation

| Decision | Outcome |
|---|---|
| Platform | **Greenhouse** (unchanged) |
| Approach | **User-controlled browser extension** (unchanged) |
| Final submit | **User only** (unchanged) |
| M0 | **Complete** (Postgres report pending environment) |
| **Next** | **Conditional GO to M1** — extension shell + assist UX; still **no** production autofill until M0 Postgres re-run is acknowledged and at least one real Greenhouse URL appears in JobLens (or product accepts fixture-only M1) |
| **NO-GO** remains on | Silent submit, CAPTCHA bypass, employer creds, headless auto-apply, multi-platform v1 |

---

## How to re-run reports

```bash
cd backend
python scripts/m0_backfill_and_report.py
python -m pytest tests/test_m0_application_url.py -q
```
