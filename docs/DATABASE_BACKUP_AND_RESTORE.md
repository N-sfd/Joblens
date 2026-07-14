# Database Backup and Restore

## Provider

- **Production target:** Managed PostgreSQL (Render / Neon / Supabase / Azure Flexible Server)
- **Local default:** SQLite — **not** valid for production backup validation

## Baseline policy

| Item | Value |
|------|--------|
| Frequency | Daily automated + before every migration / release |
| Retention | 7 daily, 4 weekly, 3 monthly |
| Encryption | Provider-managed at rest; restrict dump access |
| Storage | Outside the application host (provider backups or encrypted object store) |
| Access | Ops / release owner only |
| RPO | ≤ 24 hours (daily); aim tighter before releases |
| RTO | Documented restore within 4 hours for severe incidents |

**Do not** store backups in the git repository.

## Pre-release backup

```bash
# Example (adjust host/db names). Run from a secure workstation.
pg_dump -Fc -f joblens_crm_ats_pre_release_YYYY-MM-DD.dump "$DATABASE_URL"
# Verify non-zero size + checksum
ls -lh joblens_crm_ats_pre_release_YYYY-MM-DD.dump
sha256sum joblens_crm_ats_pre_release_YYYY-MM-DD.dump
```

Record: filename, timestamp (UTC), size, checksum, operator, environment.

## Restore drill (non-production)

1. Create a **temporary** empty database.
2. `pg_restore` (or provider restore-to-new) into that database.
3. Point a staging API at the restored DB (do **not** overwrite production).
4. Verify:

```sql
SELECT version_num FROM alembic_version;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM job_requirements;
SELECT COUNT(*) FROM employees;
SELECT COUNT(*) FROM submissions;
SELECT COUNT(*) FROM crm_contacts;
SELECT COUNT(*) FROM crm_organizations;
SELECT COUNT(*) FROM interviews;
SELECT COUNT(*) FROM offers;
SELECT COUNT(*) FROM crm_activities;
```

5. Confirm API `/health/ready`, login, and sample list pages.
6. Document duration, verification results, issues, verdict (`PASS` / `FAIL`).

## File storage

If resumes/documents live in object storage:

- Enable versioning / soft-delete protection where available
- Document bucket region, encryption, IAM
- DB backup alone is **insufficient** — include object-storage recovery steps

## Phase 8 status

| Item | Status |
|------|--------|
| Procedure documented | Yes |
| Production dump in this environment | **Pending ops** — requires production credentials |
| Restore drill | **Pending ops** against temporary DB |

Release gate: treat backup/restore as **Conditional GO** until ops completes a restore drill with recorded checksum and counts.
