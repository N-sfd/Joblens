# Phase 5 — Milestone M3 Report

**Date:** 2026-07-14  
**Scope:** Optional document-upload assistance + explicit “I submitted” confirmation.  
**Not in scope:** Silent submit, auto Submit click, CAPTCHA, login, multi-platform, broader hosts.

---

## Verdict

### **CONDITIONAL GO → M4 (polish / store packaging / production readiness)**

M3 development exit criteria are met for local/fixture testing.

**Production rollout still blocked** until PostgreSQL inventory + migrations through `i9d0e1f2a3b4` are verified on `:5433`.

**M4** should focus on: production host permissions, Chrome Web Store packaging, UX polish, and closing the Postgres gate — still **no** silent submit.

---

## Files created

| Path | Purpose |
|---|---|
| `backend/services/seeker_document_storage.py` | Local seeker file storage |
| `backend/routers/extension_upload.py` | Documents, upload sessions, submission confirm |
| `backend/migrations/versions/i9d0e1f2a3b4_add_m3_documents_and_upload_sessions.py` | M3 schema |
| `backend/tests/test_extension_m3.py` | Token/ownership/Applied tests |
| `browser-extension/src/shared/uploadEngine.ts` | File assign + advisory confirmation detect |
| `browser-extension/tests/upload_m3.test.ts` | Upload safety tests |
| `docs/PHASE5_M3_REPORT.md` | This report |

## Files modified

| Path | Change |
|---|---|
| `backend/models.py` | `SeekerDocument`, `ApplicationDocument`, `ExtensionUploadSession`, JobApplication confirmation columns |
| `backend/routers/resume.py` | Retain original resume bytes as `SeekerDocument` |
| `backend/routers/extension.py` | Capabilities: upload assist on, submit still off |
| `backend/routers/applications.py` | Timeline note for confirmation number |
| `backend/main.py` | Register `extension_upload` |
| `backend/auth.py` / `database.py` | Guest migrate + ensure columns |
| Extension popup/content/api/messages | Document + I Submitted flows |
| Manifest / package | Version **0.3.0** (set in messages; bump package on package) |

---

## Manifest permissions

**No new permissions.** Upload uses existing Greenhouse hosts + localhost API.

---

## Backend endpoints (M3)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/extension/documents` | Metadata only |
| POST | `/api/extension/documents/snapshot-cover-letter` | Immutable `.txt` snapshot |
| POST | `/api/extension/upload-session/start` | One-time retrieval token |
| GET | `/api/extension/upload-session/{id}/file` | One-time byte retrieval |
| POST | `/api/extension/upload-session/result` | Status only |
| POST | `/api/extension/upload-session/cancel` | Cancel |
| POST | `/api/extension/submission/confirm` | Record user confirmation / In Progress |

**No** `SUBMIT_APPLICATION` endpoint or message type.

---

## Database migration

**`i9d0e1f2a3b4`** adds `seeker_documents`, `application_documents`, `extension_upload_sessions`, and JobApplication confirmation/document reference columns.

```bash
cd backend && python -m alembic upgrade head
```

---

## Document model

- **SeekerDocument** — binary file + version_number + sha256; created on resume analyze or cover-letter snapshot  
- **ApplicationDocument** — associates exact version to a JobApplication (method/status metadata, no bytes)  
- **ExtensionUploadSession** — hashed one-time retrieval token (5 minutes)

---

## Supported file types

`.pdf`, `.doc`, `.docx`, `.txt`, `.rtf` (max 5MB default). Accept attribute checked before session start.

---

## Upload-assist / fallback

1. User selects document → separate consent → start session → retrieve once → DataTransfer into file input → verify → clear memory  
2. On failure / unsupported: message + Download / Manual / Continue  
3. Existing files preserved unless **Replace Existing File**

---

## One-time retrieval security

User + document + session scoped; short-lived; hash at rest; second use → 410; cross-user → 404. No long-lived public URLs. No credential logging.

---

## Resume / cover-letter version tracking

`version_number` on SeekerDocument; ApplicationDocument stores `source_document_id` + `source_document_version` + file_name; JobApplication holds `resume_document_id` / `cover_letter_document_id` after confirmation.

---

## Submission confirmation

Filling/uploading **never** set Applied. Optional advisory confirmation-page detect does **not** set Applied.  
**I Submitted** → checkbox required → `Mark as Applied` → Applied + applied_at + one 7-day reminder (idempotent) + activity.  
Protected statuses (Interviewing/Offer/Rejected/Withdrawn) not overwritten.  
**Save as In Progress** does not set `applied_at`.

---

## Application Status

Timeline includes derived Applied / confirmation number when present; AiActivity events for upload approved/result and submission_confirmed (counts/IDs only, no document contents).

---

## Fixtures & tests

| Suite | Result |
|---|---|
| Extension vitest | **23 passed** |
| Backend extension M1–M3 | **19 passed** |
| Full backend | **67 passed** |

---

## PostgreSQL inventory status

**Still pending** (Docker engine unavailable). Required before production rollout.

---

## Security findings

| Item | Status |
|---|---|
| No submit click / no SUBMIT_APPLICATION | Enforced |
| Separate consent per document | Popup flow |
| One-time retrieval | Tested |
| Cross-user isolation | Tested |
| Existing upload not replaced by default | Tested |
| Applied only after explicit confirm | Tested |

---

## Known limitations

1. jsdom cannot fully verify Chrome DataTransfer file assignment — runtime Chrome required for true upload verification  
2. Cover letters are snapshotted as `.txt` (no silent generation in extension)  
3. Tracker `job_application_id` must be known for Applied recording (from fill-session result or prior save)  
4. Embedded Greenhouse on employer domains still out of host scope  
5. Postgres gate still open  

---

## Updated recommendation for M4

| Decision | Outcome |
|---|---|
| M3 | **Complete** for local assisted upload + confirm-submit recording |
| **M4** | **Conditional GO** — production packaging, Postgres validation, UX polish |
| **NO-GO** | Silent submit, CAPTCHA bypass, multi-platform v1, employer credentials |
