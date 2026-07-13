# Phase 5 — Assisted Application Scoping Gate

**Status:** Decision document (no production automation code; no migrations)  
**Date:** 2026-07-13  
**Scope:** Select exactly one employer application platform and specify the first assisted-application prototype.

---

## 1. Selection evidence — JobLens job data

### Data sources inspected

| Source | Location | Notes |
|---|---|---|
| ATS job requirements | `job_requirements` in local `backend/aijob.db` | Primary Discover Jobs inventory |
| Tracker applications | `job_applications.job_url` + `job_snapshot_json` | Includes demo/manual URLs |
| Analysis scripts | `backend/scripts/analyze_application_platforms.py`, `analyze_application_urls_deep.py` | Re-runnable |

**Environment note:** Local Postgres on `:5433` was unavailable during this gate (Docker Desktop not running). Analysis used the local SQLite database that the backend falls back to / ships with. Re-run the scripts against production/Postgres before locking a go-live adapter.

### Inventory snapshot (local SQLite)

| Metric | Count |
|---|---|
| Total `job_requirements` | 2 |
| Jobs with `application_url` populated | **0** |
| Recruiter-contact only (email, no application URL) | **1** |
| Neither URL nor recruiter email | **1** |
| Jobs where ATS platform can be identified from `application_url` | **0** |
| URLs extracted from tracker `job_url` / snapshots | 12 |
| Identified ATS platforms among those URLs | **0** (Greenhouse / Lever / Ashby / Workable / Workday / iCIMS all **0**) |

### Domains found (tracker / demo URLs)

These are mostly **generic employer career hubs**, not detectable ATS apply forms:

| Domain | Count | Classification |
|---|---|---|
| careers.google.com | 1 | generic_employer |
| careers.microsoft.com | 1 | generic_employer |
| amazon.jobs | 1 | generic_employer |
| shopify.com | 1 | generic_employer |
| careers.airbnb.com | 1 | generic_employer |
| stripe.com | 1 | generic_employer |
| metacareers.com | 1 | generic_employer |
| vercel.com | 1 | generic_employer |
| careers.twitter.com | 1 | generic_employer |
| careers.linkedin.com | 1 | linkedin / careers hub |
| uber.com | 1 | generic_employer |
| jobs.netflix.com | 1 | generic_employer |

### Platform distribution (detectable ATS hosts)

| Platform | Jobs with identifiable apply URL |
|---|---|
| Greenhouse | 0 |
| Lever | 0 |
| Ashby | 0 |
| Workable | 0 |
| SmartRecruiters | 0 |
| Workday | 0 |
| iCIMS | 0 |
| Generic / unidentifiable career pages | 11 |
| LinkedIn careers hub | 1 |
| Recruiter-contact only (no apply URL) | 1 |
| Platform cannot be identified | **All current apply-capable rows** |

### Interpretation

1. **JobLens volume cannot yet pick a winner among ATS vendors** — there are **zero** populated ATS application URLs in the analyzed inventory.
2. The **dominant real workflow today** is **recruiter contact** and **manual / generic career-page Apply Options**, not ATS autofill.
3. Tracker demo data points at large-employer career sites that *often* use Workday or Greenhouse behind the scenes, but JobLens does not currently store the final apply host, so those cannot be counted as platform volume.

**Implication for selection rule:** “Choose based on real JobLens job volume” yields **no ATS majority**. The gate therefore:

- Selects a **prototype platform** using **technical fit + industry prevalence + future JobLens import path**
- Requires a **data instrumentation milestone** before building the adapter
- Keeps recruiter-contact / Apply Options as the primary production path until URL density improves

---

## 2. Selected platform

### Decision: **Greenhouse** (boards.greenhouse.io / job-boards.greenhouse.io / embedded `#grnhse_app`)

**Not selected for v1:** Lever, Ashby, Workable, SmartRecruiters, Workday, iCIMS, generic employer forms.

### Why Greenhouse

| Factor | Assessment |
|---|---|
| Current JobLens volume | **0 identifiable jobs** — selection is **not** volume-justified yet |
| Industry prevalence | Dominant mid-market / tech ATS; many public careers pages use Greenhouse boards or embeds |
| Form structure | Relatively consistent public apply forms; documented question schema via Job Board API |
| Extension ecosystem | Multiple autofill products already target Greenhouse (evidence that DOM patterns are tractable) |
| Difficulty vs Workday | Lower than Workday (Workday multi-step, auth walls, heavier bot protection) |
| Fit to JobLens | Aligns with Apply Options “employer website” path + profile/resume already in product |

### How many current jobs use it

**0** in the analyzed local database. Prototype work must include seeded Greenhouse fixtures and production URL classification before claiming coverage metrics.

### Form structure (public Greenhouse apply)

Typical fields on `boards.greenhouse.io/...` (and embeds):

- First name, last name, email, phone  
- Resume / CV file upload (often required)  
- Cover letter file and/or textarea  
- LinkedIn / website / portfolio style link questions  
- Custom screening questions (text, select, multi-select, yes/no)  
- Optional location questions  
- Optional EEO / demographic / compliance blocks  
- GDPR / data-compliance checkboxes when configured  

Greenhouse Job Board docs expose a per-job `questions` array (`input_text`, `textarea`, `input_file`, `multi_value_single_select`, `multi_value_multi_select`, hidden fields, etc.).

### Authentication requirements

- **Public job posts:** Usually **no candidate login** to Greenhouse; apply form is public.  
- **Employer Job Board API:** Uses **board token + API key** (HTTP Basic) — intended for **employers’ own sites**, not for JobLens as a third-party autofill product. JobLens **must not** rely on employer API keys for the candidate extension.  
- Some employers wrap Greenhouse behind their SSO/careers login — treat as **pause / unsupported** for v1.

### File-upload behavior

- Resume and cover letter are standard `<input type="file">` fields.  
- Extension can set files only with **user-gesture constraints** in modern browsers; plan for **user-confirmed upload** (extension prepares blob from JobLens download with explicit click).  
- Job Board API multipart submit exists for employers; **out of scope** for candidate extension (would require employer credentials).

### Screening-question behavior

- Highly variable per job.  
- v1 fills **only mapped, approved, non-sensitive** fields.  
- Unknown / free-form / sensitive questions → **surface as missing / manual**.

### CAPTCHA / verification

- Many Greenhouse boards have **no CAPTCHA** on public apply.  
- Some employers add bot protection, email verification, or anti-abuse later.  
- **Policy:** never bypass; pause workflow and instruct the user.

### Expected technical difficulty

**Medium** for assisted fill + user submit; **High** for silent auto-submit (rejected for v1).

---

## 3. Recommended implementation approach

### Compared options

| Approach | Verdict for v1 |
|---|---|
| **Browser extension (user-controlled)** | **Selected** |
| Server-side browser automation | Rejected — CAPTCHA/MFA, credential risk, compliance, cost |
| Preparation-only web workflow (no DOM fill) | Valuable fallback / Phase 5.0, but not the primary assisted prototype |

### Why extension (not remote browser)

- Matches default preference: **user-controlled browser**, no employer passwords, no hidden sessions.  
- Can fill visible fields after permission on allowed hosts.  
- Natural pause for review / CAPTCHA / unsupported questions.  
- Aligns with industry “assisted autofill” pattern (fill + **user clicks Submit**).

### Complementary preparation workflow (same release train)

Even with an extension, JobLens UI should:

1. Start an application attempt  
2. Confirm resume + profile  
3. Open the employer URL  
4. Show consent + field preview  
5. Hand off to extension  
6. Record outcome only on **user-confirmed** submission  

If the extension is unavailable, fall back to Apply Options (open URL / contact recruiter) without marking Applied.

---

## 4. Terms and technical constraints

### Evidence reviewed

- Greenhouse Job Board API docs (`developers.greenhouse.io/job-board`) — schema + application POST for **board owners**  
- Public descriptions of Greenhouse autofill extensions (fill-in-browser, no auto-submit)  
- Greenhouse marketing/legal pages were not fully retrievable in this environment (terms URL 404 / fetch limits)

### Constraints (conservative — do not claim permission without employer-specific evidence)

| Question | Finding for JobLens v1 |
|---|---|
| Is form autofill permitted? | **Not explicitly licensed by Greenhouse to JobLens.** Candidate-side browser autofill of a form the user opened is common industry practice, but **not a Greenhouse partnership**. Treat as **user agent assistance**, not a Greenhouse-approved integration. |
| Is automated submission permitted? | **Not clearly permitted.** Job Board application POST requires **employer API credentials**. Third-party bulk/auto submit is **out of policy for JobLens v1**. |
| Public API for candidates? | **No.** Job Board API is for employers/board integrators. |
| Browser extensions technically supported? | **Technically feasible** on `boards.greenhouse.io` / embeds; not an official Greenhouse extension program for JobLens. |
| CAPTCHA / bot protection? | **Sometimes**; never bypass. |
| Login required? | **Usually no** for public posts; yes for some employer wrappers → pause. |
| Document uploads safe to automate? | **Only with user action** in-browser; never store employer credentials. |
| Rate limits | Employer API has limits; irrelevant if we do not call employer API. Abuse of public boards risks IP/board blocks — **human-paced, user-initiated only**. |

### Design limit (mandatory)

Because automated submission is **not clearly permitted**:

- Detect fields  
- Fill **approved** values  
- Prepare / assist document upload  
- Highlight missing / unsupported / sensitive questions  
- **Require the user to review and click the final Submit**  
- Record Applied **only after explicit confirmation**

---

## 5. First supported workflow

1. User selects a JobLens job (Discover / Application Status / Tracker).  
2. User selects a saved resume.  
3. User selects application profile data (JobLens Profile).  
4. JobLens creates an **application attempt** and opens the employer application page.  
5. Extension detects Greenhouse (host or `#grnhse_app` embed).  
6. Extension reads **visible** field definitions.  
7. Backend returns **only approved mapped values** via short-lived token.  
8. Extension fills **supported non-sensitive** fields.  
9. Resume upload assisted when permitted (user gesture).  
10. Missing / unsupported questions listed.  
11. Workflow pauses for user input.  
12. Review summary shown (extension popup + optional JobLens panel).  
13. **User** clicks employer Submit (or explicitly confirms).  
14. JobLens updates Application Status **only when submission is confirmed**.

---

## 6. Supported vs unsupported fields (v1)

### Supported (when mapped + approved)

- First name, last name, full name  
- Email, phone  
- City, state/province, country, postal code  
- LinkedIn, portfolio, GitHub URLs  
- Resume upload, cover-letter upload  
- Current company, current job title  
- Work-authorization / sponsorship **only if explicitly reviewed** in Profile  

### Never auto-answered

- Demographic / EEO / voluntary self-ID  
- Disability, veteran status  
- Criminal history, medical  
- Legal attestations / GDPR checkboxes (user must tick)  
- Salary expectations  
- Security clearance  
- Unapproved free-form employer questions  

---

## 7. Consent defaults

User must approve: open page, read form, request profile data, fill fields, upload docs, save reviewed answers, record result.

| Setting | Default |
|---|---|
| Require review before submission | **ON** |
| Automatic final submission | **OFF** (and not implemented) |
| Save new answers automatically | **OFF** |
| Store employer credentials | **NEVER** |
| Bypass CAPTCHA | **NEVER** |

---

## 8. Extension permissions (minimum)

### Allowed

- Host permissions **only** for:  
  - `https://boards.greenhouse.io/*`  
  - `https://job-boards.greenhouse.io/*.greenhouse.io/*` (as needed)  
  - Optional: `https://*.greenhouse.io/*` narrowly if embeds require it  
  - JobLens app origin (frontend) for messaging  
- `activeTab` (or equivalent) while user initiates assist  
- `storage` for short-lived session token + non-sensitive UI prefs  
- Communication: `externally_connectable` / message passing with JobLens origin only  

### Authentication

- Short-lived **scoped attempt token** from JobLens backend (minutes, single attempt)  
- No permanent API keys in the extension  
- Token in extension session storage; cleared on complete/cancel/expiry  

### Must not

- Read unrelated sites / browsing history / inactive tabs  
- Store passwords or plain-text API secrets  
- Auto-submit  
- Bypass CAPTCHA / security controls  
- Log resume contents, work-auth details, or full profile payloads  

### Logging

- Event types + field keys + statuses only  
- No answer values for sensitive fields  

---

## 9. Technical contract

```
JobLens Frontend                Backend                         Extension
     |                             |                                |
     |-- POST /application-attempts (job, resume, profile) ------> |
     |<-- attempt_id + scoped_token + allowed_field_map -----------|
     |-- open application_url (+ deep link token) ---------------->|
     |                             |                                |
     |                             |<-- detect platform / fields ---|
     |                             |-- approved values (scoped) --->|
     |                             |<-- progress events ------------|
     |                             |<-- missing / paused -----------|
     |                             |<-- user_confirmed_submit ------|
     |                             |-- update JobApplication -------|
```

### Suggested endpoints (design only — not implemented this phase)

| Endpoint | Purpose |
|---|---|
| `POST /api/application-attempts` | Start attempt; return scoped token |
| `GET /api/application-attempts/{id}` | Status for owner |
| `POST /api/application-attempts/{id}/fields` | Extension posts detected fields |
| `GET /api/application-attempts/{id}/mapped-values` | Approved fill values |
| `POST /api/application-attempts/{id}/events` | Progress / pause / error |
| `POST /api/application-attempts/{id}/confirm-submit` | User-confirmed outcome → status update |

Token scopes: `attempt:{id}`, `user:{id}`, expiry, no admin/ATS access.

Ownership: same as JobApplication — other users receive 404.

---

## 10. Proposed database model (design only — **no migration this phase**)

### `application_attempts`

`id`, `user_id`, `job_application_id`, `job_id` (source job requirement id), `resume_id`, `cover_letter_id`, `profile_id`, `platform` (`greenhouse`), `application_url`, `status` (`started` | `detecting` | `filling` | `needs_user` | `reviewed` | `submitted_confirmed` | `failed` | `cancelled`), timestamps (`started_at`, `reviewed_at`, `submitted_at`, `completed_at`, `last_activity_at`), `confirmation_number`, `confirmation_url`, `error_code`, `error_message`

### `application_fields`

`id`, `application_attempt_id`, `external_field_key`, `normalized_field_name`, `field_label`, `field_type`, `is_required`, `is_sensitive`, `mapped_profile_field`, `status` (`detected` | `mapped` | `filled` | `skipped` | `needs_user`), `user_approved`, timestamps

### `application_events`

`id`, `application_attempt_id`, `user_id`, `event_type`, `event_status`, `metadata_json` (non-sensitive), `created_at`

**Do not** add browser-automation session credentials tables.

---

## 11. Success criteria (prototype)

1. Greenhouse detected on supported hosts / embed  
2. Basic personal fields mapped accurately  
3. Selected resume upload assisted  
4. Missing info clearly listed  
5. Sensitive questions never inferred  
6. User reviews every prepared value  
7. CAPTCHA / login / unsupported → pause  
8. No silent submit  
9. Confirmed result updates Application Status  
10. Failure does **not** mark Applied  
11. Cross-user isolation  
12. Existing Resume / Match / Tracker / Discover / Apply Options / Profile / Application Status unaffected  

---

## 12. Prototype milestones

| Milestone | Deliverable | Exit criteria |
|---|---|---|
| **M0 — Data gate** | Classify `application_url` on import; dashboard count by platform | ≥20 real Greenhouse URLs in staging **or** documented fixture pack + import path |
| **M1 — Attempt API** | Create attempt + scoped token + events (no fill) | Ownership tests pass |
| **M2 — Extension shell** | Detect Greenhouse; list fields; no fill | Detection accuracy on fixtures |
| **M3 — Assisted fill** | Fill supported non-sensitive fields; pause on rest | Manual review checklist |
| **M4 — Upload + confirm** | Resume assist; confirm-submit → Application Status | No false Applied |
| **M5 — Hardening** | Consent UI, logging redaction, permission review | Security checklist signed off |

---

## 13. Testing plan

### Backend

- Attempt ownership (404 other user)  
- Token expiry / scope  
- Confirm-submit transitions only when allowed  
- Failure paths do not set Applied  
- Events reject sensitive payloads in logs  

### Extension

- Fixture jobs on `boards.greenhouse.io` (test board)  
- Embedded `#grnhse_app` page  
- Field mapping golden tests  
- CAPTCHA / login pause simulations  
- Permission review (Chrome/Edge store checklist)  

### Product

- Discover → Apply Options → Assist (Greenhouse only)  
- Non-Greenhouse URL → clear unsupported message + existing Apply Options  
- Application Status timeline receives confirm event only  

---

## 14. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Insufficient real Greenhouse volume in JobLens | High | M0 data gate; fixtures; improve Zoho/parser `application_url` extraction |
| DOM / form changes break selectors | High | Adapter versioning; detection health checks |
| Mis-marking Applied | High | Confirm-submit only; never infer from URL open |
| Sensitive data leakage via logs/extension | High | Redaction; scoped token; no answer logging |
| Store / enterprise extension policy | Medium | Manifest v3 min permissions; clear privacy text |
| Users expect Workday/LinkedIn next | Medium | Explicit single-platform messaging |
| Legal ambiguity of autofill | Medium | User-agent model; no auto-submit; no Greenhouse API key misuse |

---

## 15. Go / no-go recommendation

### **CONDITIONAL GO — Greenhouse browser-extension assisted fill (user submits)**

**GO** to detailed design and M0–M1 implementation planning **if** stakeholders accept:

1. Current JobLens data **does not** yet show Greenhouse majority volume (0 URLs).  
2. v1 is **assist + user submit**, never silent auto-apply.  
3. M0 data instrumentation is **blocking** before M2–M4 production rollout.  
4. Recruiter-contact and Apply Options remain first-class for non-Greenhouse jobs.

### **NO-GO** on:

- Server-side / headless auto-apply  
- Multi-platform adapters in the first prototype  
- Employer credential storage  
- CAPTCHA bypass  
- Calling Greenhouse Job Board application POST with scraped/employer keys from JobLens candidate accounts  

---

## 16. M0 completion (2026-07-14)

M0 is **complete** except PostgreSQL inventory (Docker engine unavailable). Full write-up: [`docs/PHASE5_M0_REPORT.md`](./PHASE5_M0_REPORT.md).

| Deliverable | Result |
|---|---|
| URL normalize + classify | `backend/services/application_url.py` |
| Pipeline instrumentation | Parse / CRM / public API / Save-Apply / tracker snapshot / Application Status |
| Migration | `f6a7b8c9d0e1` → `application_platform` |
| Fixtures + 6 samples / 3 boards | `backend/fixtures/greenhouse/` |
| Read-only detector | `backend/services/greenhouse_detector.py` |
| SQLite report | 2 jobs; 0 apply URLs; 0 Greenhouse |
| Postgres report | Unavailable (`:5433` refused) |
| Tests | 17 M0 + 48 total backend passed |
| **Updated gate** | **Conditional GO → M1** (extension shell only; no production autofill yet) |

---

## 17. M1 completion (2026-07-14)

M1 extension shell is **complete**. Full write-up: [`docs/PHASE5_M1_REPORT.md`](./PHASE5_M1_REPORT.md).

| Deliverable | Result |
|---|---|
| MV3 extension workspace | `browser-extension/` |
| Min permissions + Greenhouse hosts | No `<all_urls>` |
| Consent + privacy + diagnostics UI | Popup |
| Extension auth + diagnostics API | `/api/extension/*` |
| Migration | `g7b8c9d0e1f2` |
| Tests | Extension 8 + backend 54 passed |
| Postgres inventory | Still pending (Docker down) |
| **Updated gate** | **Conditional GO → M2** (assisted fill; user submits) |

---

## 18. M2 completion (2026-07-14)

M2 assisted fill is **complete** for local/fixture use. Full write-up: [`docs/PHASE5_M2_REPORT.md`](./PHASE5_M2_REPORT.md).

| Deliverable | Result |
|---|---|
| Fill-session API + model | `/api/extension/fill-session/*`, migration `h8c9d0e1f2a3` |
| Mapping review + fill/undo | Extension popup + `fillEngine.ts` |
| No upload / no submit | Enforced |
| Application In Progress | Protected statuses preserved |
| Tests | Extension 18 + backend 59 passed |
| Postgres | Still pending for production |
| **Updated gate** | **Conditional GO → M3** (upload assist + confirm-submit UX) |

---

## 19. M3 completion (2026-07-14)

M3 upload assist + “I submitted” recording is **complete** for local/fixture use. Full write-up: [`docs/PHASE5_M3_REPORT.md`](./PHASE5_M3_REPORT.md).

| Deliverable | Result |
|---|---|
| SeekerDocument + ApplicationDocument + upload sessions | Migration `i9d0e1f2a3b4` |
| One-time document retrieval | `/api/extension/upload-session/*` |
| Explicit I Submitted → Applied | `/api/extension/submission/confirm` |
| No silent submit | Message contract + capabilities |
| Tests | Extension 23 + backend 67 passed |
| Postgres | Still pending for production |
| **Updated gate** | **Conditional GO → M4** (packaging + Postgres gate) |

---

## 20. M4 completion (2026-07-09)

Production packaging, security hardening, privacy/docs, and pilot readiness are **complete** for a closed pilot. Full write-up: [`docs/PHASE5_M4_REPORT.md`](./PHASE5_M4_REPORT.md).

| Deliverable | Result |
|---|---|
| Production extension package | `joblens-greenhouse-extension-v0.4.0.zip` (no localhost hosts) |
| Feature flags + pilot allowlist | `extension_flags.py` — no automatic submission |
| Rate limits + audit + ops revoke | Extension API buckets + `audit_logs` |
| Privacy + user docs + onboarding | `/privacy/extension`, guide, popup acknowledgments |
| Postgres tooling | `m4_postgres_validate.py`, `joblens_test`, optional SQLite import |
| Live Postgres + pilot execution | Postgres **validated** 2026-07-13; **pilot still pending** |
| **Updated gate** | **Conditional GO — closed Greenhouse pilot**; public store **NO-GO** until pilot metrics + deploy secrets |

---

## 21. M5 completion (2026-07-13)

Pilot enablement + production cutover/store readiness docs. Full write-up: [`docs/PHASE5_M5_REPORT.md`](./PHASE5_M5_REPORT.md).

| Deliverable | Result |
|---|---|
| Pilot entitlement API | `GET /api/extension/pilot/me` |
| Operator metrics | `pilot_metrics` + `/ops/pilot-metrics` + `m5_pilot_metrics.py` |
| Store / cutover / malware plan | `PHASE5_M5_STORE_CHECKLIST.md`, `PRODUCTION_CUTOVER.md`, `MALWARE_SCAN_PLAN.md` |
| Extension UX | Pilot / entitlement messaging in popup |
| Human pilot execution | **Still required** |
| **Updated gate** | **Conditional GO — execute closed pilot**; public store **NO-GO** until pilot GO metrics |

---

## Appendix A — Re-run analysis

```powershell
cd "e:\projects\AI Projects\JobLens\backend"
python scripts/analyze_application_platforms.py
python scripts/analyze_application_urls_deep.py
```

Point `DATABASE_URL` at Postgres when Docker is up to refresh production-shaped counts.

## Appendix B — Files produced this phase

| File | Purpose |
|---|---|
| `docs/PHASE5_ASSISTED_APPLICATION_SCOPING.md` | This decision document |
| `backend/scripts/analyze_application_platforms.py` | Domain/platform counts from `application_url` |
| `backend/scripts/analyze_application_urls_deep.py` | URL extraction from descriptions/snapshots |

**Not produced:** migrations, extension code, application_attempt tables, production automation.
