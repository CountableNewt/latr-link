# L@tr.link browser extension

Save the active tab to your L@tr.link library through the Go bookmark and metadata services and ATProto OAuth. Bookmarks remain on the signed-in user's PDS.

## Workspace

| Path | Role |
|------|------|
| [`apps/extension`](../../apps/extension) | Chromium, Firefox, and Safari Web Extension (WXT) |
| [`packages/latr-web-client`](../../packages/latr-web-client) | Shared bookmark resolver, gateway client, and `LatrRepo` |
| [`apps/extension/store/BUILD.md`](../../apps/extension/store/BUILD.md) | Reproducible Chrome and Firefox store packaging |

## Hosted API and OAuth

Public store builds call `https://latr.link/api/latr-gateway`. The web proxy injects the internal first-party credential server-side; the extension contains no gateway API key. Public developer registration and key issuance are retired.

Production OAuth uses `https://api.latr.link/oauth/extension-client-metadata.json` and the callback `https://latr.link/extension/callback`. For development, the checked-in environment template uses the corresponding `testing.latr.link` web proxy and `api.testing.latr.link` OAuth metadata. These testing aliases select a Vercel branch preview rather than a separate Development project.

Before testing a preview, confirm its public metadata lists the matching HTTPS callback and can be fetched without Vercel authentication. To test another branch through the testing aliases, attach those aliases to that branch's deployment.

ATProto redirects to the configured hosted HTTPS callback. The background listener validates its exact origin/path and OAuth parameters, then replaces that tab with the extension-owned `callback.html`. OAuth state and sessions remain in the extension origin in both Chrome and Firefox.

## Local development

Use Bun 1.3.14 from the monorepo root:

```bash
cp apps/extension/.env.example apps/extension/.env.local
bun install --frozen-lockfile
bun run --cwd apps/extension dev          # Chromium (default)
bun run --cwd apps/extension dev:firefox
```

The template routes development saves through the hosted testing web proxy without a client credential. Set the API, OAuth metadata, callback, and library URLs together when switching environments. Environment variables are compiled into each extension build.

Load the unpacked build shown by WXT:

- Chrome: `apps/extension/.output/chrome-mv3` from `chrome://extensions` with Developer mode enabled.
- Firefox: load `apps/extension/.output/firefox-mv2/manifest.json` temporarily from `about:debugging#/runtime/this-firefox`.

Firefox uses the stable add-on ID `latr-link@stygian.tech`, requires Firefox 140+ for development and 142+ for store builds, and declares transmission of authentication information and browsing activity. Browsing activity covers URLs explicitly saved to the user's L@tr.link library.

## Builds

```bash
bun run --cwd apps/extension build:chromium
bun run --cwd apps/extension build:firefox
bun run --cwd apps/extension build:safari   # macOS + Xcode for distribution
```

For public Chrome and Firefox submissions, use the credential-isolated store packaging command:

```bash
bun run --cwd apps/extension package:stores
```

It writes browser packages, the Firefox source archive, a release manifest, and checksums under `apps/extension/.output/store/`. Store mode ignores local environment files, clears development overrides, and uses the Production proxy and OAuth defaults. See the [store build guide](../../apps/extension/store/BUILD.md) for reproduction and verification.

The `zip:chromium` and `zip:firefox` commands package ordinary environment-specific builds; use `package:stores` for public submissions.

## Environment variables

See [`apps/extension/.env.example`](../../apps/extension/.env.example). No gateway credential is required when using a supported web proxy.

| Variable | Description |
|----------|-------------|
| `VITE_LATR_GATEWAY_URL` | Web proxy base, such as `https://testing.latr.link/api/latr-gateway` |
| `VITE_LATR_APP_ENV` | `local`, `dev`, `test`, or `prod` |
| `VITE_LATR_GATEWAY_CLIENT_ID` | Optional internal client ID for a private direct-gateway development setup; leave empty for the web proxy |
| `VITE_LATR_GATEWAY_API_KEY` | Optional paired internal development key; leave empty for the web proxy and never distribute it |
| `VITE_ATPROTO_CLIENT_ID` | Public OAuth metadata URL |
| `VITE_ATPROTO_REDIRECT_URI` | Hosted HTTPS callback listed by that metadata document |
| `VITE_LATR_WEB_URL` | Web app for “Open library” |

Direct-gateway development credentials must be configured internally by the operator; no public registration endpoint exists. Store mode always uses the credential-free Production proxy.

## Smoke test

1. Sign in with a Bluesky handle from the popup.
2. Open a normal HTTPS article tab, add comma- or Enter-delimited tags, and select **Save current tab**.
3. Confirm the item and its exact, case-sensitive tags appear at `/library` on the matching web environment with the same account.
4. Sign out, author tags in the popup, and sign back in; confirm OAuth continuation keeps the tags on the saved bookmark.
5. Save a `bsky.app` post URL: the encountered HTTPS URL remains the bookmark subject; preview discovery may classify it without replacing it.
6. Sign out from the popup.
7. Repeat saves through the context menu and `Ctrl+Shift+L` / `Command+Shift+L`; these queue the URL and auto-save through the popup. Firefox MV2 uses `browserAction` when available and falls back to a normal extension tab.

## CI

`scripts/ci.sh` runs Go and JavaScript checks, including extension typecheck, tests, and Chromium/Firefox builds. GitHub Actions also builds and verifies the public store packages and uploads them as CI artifacts.
