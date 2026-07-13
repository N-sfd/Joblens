# Phase 5 M4 — Controlled Pilot Checklist

## Scope

- 3–5 internal testers
- Greenhouse only
- Sanitized test applications first, then a small number of real applications chosen by each tester
- User reviews and submits manually
- No sensitive-question or legal-attestation filling by the extension

## Pilot feature flags (production)

```
ENV=production
EXTENSION_ENABLED=true
EXTENSION_DIAGNOSTICS_ENABLED=true
EXTENSION_ASSISTED_FILL_ENABLED=true
EXTENSION_DOCUMENT_UPLOAD_ENABLED=true
EXTENSION_SUBMISSION_CONFIRMATION_ENABLED=true
EXTENSION_GREENHOUSE_ENABLED=true
EXTENSION_PILOT_USER_IDS=<comma-separated user ids>
# automatic_submission_enabled must remain absent / false
```

## Metrics to collect (no answer content)

| Metric | How |
|---|---|
| Form-detection success | Tester log / diagnostics count |
| Field-mapping accuracy | Tester score 1–5 |
| Fill success rate | fill-session status |
| Document-upload success | upload-session status |
| Manual-fallback frequency | Tester tally |
| Undo reliability | Tester tally |
| Token-expiration issues | Auth failures / 401s |
| User confusion | Feedback category |
| Privacy concerns | Feedback `privacy_concern` |
| Submission-confirmation accuracy | Applied status vs actual submit |

## Production-like test script

1. Create account · 2. Complete profile · 3. Add resume · 4. Add cover letter  
5. Connect extension · 6. Analyze · 7. Review mappings · 8. Fill  
9. Upload resume · 10. Upload cover letter · 11. Manual review  
12. Simulate manual submit · 13. I Submitted · 14. Verify Application Status  
15. Verify document versions · 16. Verify one reminder  
17. Revoke extension · 18. Revoked token fails · 19. Delete document  
20. Deleted doc cannot retrieve · 21. Unsupported version rejected  
22. Rate limiting · 23. Feature-flag shutdown  

## Rollback drills

- `EXTENSION_ENABLED=false` → auth start returns 503  
- `EXTENSION_ASSISTED_FILL_ENABLED=false` → fill blocked  
- `EXTENSION_DOCUMENT_UPLOAD_ENABLED=false` → uploads blocked  
- `POST /api/extension/ops/emergency` with `revoke_all_tokens` + `EXTENSION_OPS_TOKEN`  
- Block version via `EXTENSION_BLOCKED_VERSIONS`

## Do not collect

Filled values, resume/cover contents, page HTML, cookies, employer credentials.
