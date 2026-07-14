# Role Permission Matrix

Recruitment CRM + ATS roles. **Backend enforcement is authoritative** — hiding UI is not security.

Roles: `admin` | `manager` | `recruiter` | `read_only`  
(legacy `viewer` → `read_only`)

Organization-wide read scope: `admin`, `manager`, `read_only`.  
Recruiter scope: records they created / own / are assigned to (module-specific).

## Capability matrix

| Capability | Admin | Manager | Recruiter | Read Only |
|------------|:-----:|:-------:|:---------:|:---------:|
| View Dashboard | ✓ | ✓ | ✓ (scoped metrics) | ✓ |
| Zoho Inbox | ✓ | ✓ | ✓ | ✗ (nav hidden) |
| Jobs CRUD | ✓ | ✓ | ✓ scoped | View |
| Candidates CRUD | ✓ | ✓ | ✓ scoped | View |
| Resume upload / parse | ✓ | ✓ | ✓ | ✗ |
| Matching | ✓ | ✓ | ✓ | ✗ |
| Pipeline stage moves | ✓ | ✓ | ✓ scoped | ✗ |
| Interviews / Offers | ✓ | ✓ | ✓ | View |
| Contacts / Companies | ✓ | ✓ | ✓ related | View |
| Reports / CSV export | ✓ | ✓ | ✓ scoped | ✓ permitted |
| User / role management | ✓ | ✗ | ✗ | ✗ |
| Integration settings (Zoho disconnect) | ✓ | limited | ✗ | ✗ |
| Archive / permitted delete | ✓ | per module | limited | ✗ |
| Duplicate / protected stage override | ✓ | where enabled | where enabled | ✗ |

## Navigation

| Item | Admin | Manager | Recruiter | Read Only |
|------|:-----:|:-------:|:---------:|:---------:|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Zoho Inbox | ✓ | ✓ | ✓ | ✗ |
| Jobs | ✓ | ✓ | ✓ | ✓ |
| Candidates | ✓ | ✓ | ✓ | ✓ |
| Pipeline | ✓ | ✓ | ✓ | ✓ |
| Contacts | ✓ | ✓ | ✓ | ✓ |
| Reports | ✓ | ✓ | ✓ | ✓ |
| Settings | ✓ | ✓ | Personal Settings | Personal Settings |

## Unauthorized user

| Condition | Expected |
|-----------|----------|
| No session | `401` |
| Authenticated, no ATS grant | `403` with safe message |
| Never | `500` for auth failures |

## Verification checklist

- [ ] Admin org-wide write + staff management
- [ ] Manager org-wide ops, no staff admin
- [ ] Recruiter cannot open another recruiter’s private scoped record by ID
- [ ] Read Only mutations return `403`
- [ ] Unauthenticated list/detail return `401` when `ATS_AUTH_ENFORCE=true`
