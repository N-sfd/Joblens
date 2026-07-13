# Phase 5 M5 — Chrome Web Store checklist

Do **not** submit until the controlled pilot reports GO metrics and production secrets are live.

## Package

- [ ] `npm run package:production` from `browser-extension/`
- [ ] Artifact: `joblens-greenhouse-extension-vX.Y.Z.zip`
- [ ] SHA-256 matches `*.sha256`
- [ ] `build-manifest-vX.Y.Z.json` lists commit, permissions, no localhost hosts
- [ ] Unpacked load test in a clean Chrome profile

## Store listing (draft)

| Field | Guidance |
|---|---|
| Name | JobLens Application Assist |
| Summary | Helps prepare Greenhouse job applications using your JobLens profile. You review and submit. |
| Description | See `docs/EXTENSION_USER_GUIDE.md` + `/privacy/extension` |
| Category | Productivity |
| Language | English |
| Single purpose | Assist filling Greenhouse application forms with user consent; never submits |
| Permissions justification | Copy from `browser-extension/PERMISSIONS.md` |

## Screenshots

- Use **sanitized fixtures / test boards only**
- No real applicant PII, resumes, or employer secrets
- Show: connect → analyze → review mappings → fill → I Submitted (not auto-submit)

## Privacy

- [ ] Store privacy URL points to production `/privacy/extension`
- [ ] Host permissions limited to Greenhouse + JobLens production domains

## Explicit non-claims

Do **not** claim: automatic apply, CAPTCHA solve, multi-ATS, or silent submission.
