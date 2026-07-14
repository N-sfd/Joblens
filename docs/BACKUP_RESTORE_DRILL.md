# Backup / restore drill worksheet

Complete this form before marking Blocker 1 PASS. Do **not** restore over production.

## Pre-release backup

| Field | Value |
|-------|--------|
| Environment | Production (source) / Temporary DB (restore target) |
| Operator | |
| UTC timestamp | |
| Method | `pg_dump -Fc` / provider snapshot |
| Filename | `joblens_crm_ats_pre_release_YYYY-MM-DD.dump` |
| Size (bytes) | |
| SHA-256 | |
| Storage location (not git) | |
| Encrypted | Yes / Provider-managed |
| Access restricted | Yes / No |

## Restore drill

| Field | Value |
|-------|--------|
| Target database name | (temporary only) |
| Restore duration | |
| `alembic_version` | |
| jobs count | |
| candidates (`employees`) count | |
| pipeline (`submissions`) count | |
| contacts count | |
| companies count | |
| interviews count | |
| offers count | |
| activities count | |
| App `/health/ready` | ready / not_ready |
| Login smoke | PASS / FAIL |
| Verdict | **PASS** / **FAIL** |
| Issues | |

## Commands (reference)

```bash
pg_dump -Fc -f joblens_crm_ats_pre_release_$(date -u +%Y-%m-%d).dump "$DATABASE_URL"
sha256sum joblens_crm_ats_pre_release_*.dump
# restore into NEW empty database only:
pg_restore -d "$TEMP_DATABASE_URL" --clean --if-exists joblens_crm_ats_pre_release_YYYY-MM-DD.dump
```

Attach checksum and counts to release sign-off. Update `docs/RELEASE_GATE_STATUS.md` Blocker 1 when PASS.
