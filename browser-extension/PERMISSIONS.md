# JobLens Greenhouse extension — production packaging

## Permissions (why each is required)

| Permission / host | Why |
|---|---|
| `activeTab` | Run analysis/fill only on the tab the user opens the popup for |
| `scripting` | Inject the content script into the active Greenhouse apply tab after consent |
| `storage` | Persist connection tokens (hashed session state) and onboarding acknowledgment |
| `https://boards.greenhouse.io/*` | Detect and assist on classic Greenhouse boards |
| `https://job-boards.greenhouse.io/*` | Detect and assist on Greenhouse job-board hosts |
| `https://api.joblens.app/*` | Call the production JobLens extension API |
| `https://joblens.app/*` / `www` | Open connect / privacy / profile pages |

**Not included in production:** `localhost`, `127.0.0.1`, `<all_urls>`, broad wildcards, unused permissions.

## CSP

`script-src 'self'; object-src 'self'; base-uri 'self'; form-action 'self'`

- No remote executable JavaScript
- No `eval` / `unsafe-eval`
- No dynamically downloaded code
- No inline scripts in extension pages (popup uses bundled module script)

## Builds

```bash
cd browser-extension
npm run build                 # development (localhost hosts)
npm run build:production      # production manifest + prod API defaults
npm run test
npm run package:production    # ZIP + checksum + build-manifest.json
```

Artifact name: `joblens-greenhouse-extension-v0.4.0.zip`
