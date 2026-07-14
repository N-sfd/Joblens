# Production QA Checklist

Evidence required for each checked item (screenshot, log snippet, or test name). Do not mark complete without evidence.

## Authentication & roles

- [ ] Sign-in / sign-out
- [ ] Expired token → 401
- [ ] Admin matrix (see ROLE_PERMISSION_MATRIX.md)
- [ ] Manager matrix
- [ ] Recruiter scoping
- [ ] Read Only cannot mutate
- [ ] Unauthorized / no-role user safe errors

## Modules

- [ ] Dashboard counts load; match Reports snapshots
- [ ] Zoho Inbox (if enabled)
- [ ] Jobs list / detail / filters / status
- [ ] Candidates list / detail / resume upload-parse
- [ ] Matching without duplicate on retry
- [ ] Pipeline stage transitions + activity
- [ ] Interviews / Offers via Pipeline
- [ ] Placement fields
- [ ] Rejection / withdrawal with reason
- [ ] Contacts / Companies / follow-ups
- [ ] Reports tabs + date presets + CSV
- [ ] Settings / Personal Settings by role

## Quality

- [ ] No fake / demo charts on active modules
- [ ] Loading resolves (no permanent Loading)
- [ ] Empty / error / unauthorized states
- [ ] Mobile nav + tables usable
- [ ] Chrome / Edge / Safari (where available)
- [ ] Mobile Chrome / Safari (where available)

## Security & ops

- [ ] Secrets absent from repo / client bundles
- [ ] CORS restricted to approved origins
- [ ] Security headers present
- [ ] Rate limit 429 on AI / CSV abuse
- [ ] Backup completed with checksum
- [ ] Restore drill PASS
- [ ] Monitoring / alerts active
- [ ] Rollback plan understood

## Release gate

- [ ] Backend tests green
- [ ] `npx tsc --noEmit` green
- [ ] `npm run build` green
- [ ] Smoke script green against RC
- [ ] Decision: GO / Conditional GO / NO-GO recorded
