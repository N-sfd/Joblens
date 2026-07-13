# Phase 5 M4 — Monitoring & Alerts

Structured logs use logger `joblens.extension.audit` and `audit_logs` rows with `entity_type=extension`.

## Signals

| Signal | Source |
|---|---|
| Auth failures | `extension.auth_failure` |
| Version rejected | `extension.version_rejected` |
| Origin / ID rejected | `extension.origin_rejected` |
| Token refresh / revoke | `extension.token_*` |
| Document token reuse | `extension.document_access_denied` code=`token_reused` |
| Fill / upload failures | fill-session / upload-session status + audit |
| Rate limits | HTTP 429 + optional `extension.rate_limited` |
| Feature blocked | HTTP 403/503 |

## Suggested alerts (ops)

- Spike in `extension.auth_failure` (>20 / 5 min)
- Any `document_access_denied` with cross-user pattern
- Repeated one-time-token failures
- Backend 5xx rate on `/api/extension/*`
- Database connection failures / migration drift (`alembic_version` ≠ head)
- Reminder-creation warnings / confirmation recording failures
- Unsupported extension version volume

## Do not ship to monitoring

Profile field values, resume/cover text, document bytes, tokens, cookies, CAPTCHA, employer credentials.
