# Phase 5 M4 — Rollback Plan

Prefer **feature flags** over emergency database downgrades.

## Flags

| Flag | Effect |
|---|---|
| `EXTENSION_ENABLED=false` | Disables extension auth start / assistance |
| `EXTENSION_DIAGNOSTICS_ENABLED=false` | Blocks diagnostics save |
| `EXTENSION_ASSISTED_FILL_ENABLED=false` | Blocks fill sessions (diagnostics may remain) |
| `EXTENSION_DOCUMENT_UPLOAD_ENABLED=false` | Blocks document list / upload sessions |
| `EXTENSION_SUBMISSION_CONFIRMATION_ENABLED=false` | Blocks I Submitted |
| `EXTENSION_GREENHOUSE_ENABLED=false` | Blocks Greenhouse assist |
| `EXTENSION_BLOCKED_VERSIONS` | Rejects listed extension versions with 426 |
| `EXTENSION_PILOT_USER_IDS` | Restricts fill/upload in production to allowlist |

**Never** add `automatic_submission_enabled`.

## Token revocation

- Per user: disconnect in extension / `revoke_all_for_owner`
- Global: `POST /api/extension/ops/emergency` `{ "action": "revoke_all_tokens", "admin_token": "<EXTENSION_OPS_TOKEN>" }`

## Detector / package

- Ship previous extension ZIP; block broken version via `EXTENSION_BLOCKED_VERSIONS`
- Restore previous backend deploy from host (Render)

## Database

Roll back Alembic **only** on an isolated DB with a documented plan. Prefer forward fixes. Downgrade smoke is validated on `joblens_test` only:

```bash
python scripts/m4_postgres_validate.py --downgrade-smoke
```
