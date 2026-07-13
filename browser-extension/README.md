# JobLens Browser Extension (Phase 5 M1)

Read-only Greenhouse application form diagnostics. **Does not fill, upload, or submit.**

## Permissions (Manifest V3)

| Permission | Why |
|---|---|
| `activeTab` | Analyze only the tab the user invokes |
| `scripting` | Inject content script after explicit Analyze |
| `storage` | Connection tokens + tab-session consent |
| Host: `boards.greenhouse.io`, `job-boards.greenhouse.io` | Supported apply pages only |

No `<all_urls>`, history, cookies, downloads, debugger, or webRequest.

## Develop

```bash
cd browser-extension
npm install
npm run build
npm test
```

Load unpacked in Chrome: **Extensions → Developer mode → Load unpacked → `browser-extension/dist`**.

Set JobLens + API origins in extension storage if needed (defaults: `http://localhost:3000` / `http://localhost:8000`).

## Manual test checklist

See `docs/PHASE5_M1_REPORT.md`.

## Auth flow

1. Extension `AUTH_START` → `POST /api/extension/auth/start`
2. Opens JobLens `/extension/connect?challenge=…`
3. User confirms → `POST /api/extension/auth/confirm` (cookie / guest owner)
4. Extension polls `POST /api/extension/auth/exchange` → short-lived tokens
5. `POST /api/extension/diagnostics` with Bearer extension token
6. `POST /api/extension/auth/revoke` disconnects
