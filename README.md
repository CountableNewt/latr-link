# L@tr.link

ATProto read-later with bookmarks and reading state on your own PDS. Next.js and two Go services deploy together on Vercel; Turso holds derived previews and shared replay protection. Public developer registration is retired.

```
Next.js → same-origin proxy → Go bookmark/metadata services → your PDS
                                      ↓
                                Turso operational state
```

## Monorepo layout

```
latr-link/
  apps/
    apple/         # SwiftUI iPhone/iPad app and Share Extension
    web/           # Next.js web client (Bun)
    extension/     # Chromium/Firefox browser extension
  packages/
    latr-web-client/  # shared save/gateway client (Bun)
  services/
    go-backend/       # Go bookmark and metadata services
  docs/
    architecture/
```

## Prerequisites

| Tool | Version |
|------|---------|
| [Bun](https://bun.sh) | 1.3.14 |
| [Go](https://go.dev) | as pinned in `services/go-backend/go.mod` |

## Quick start

```bash
bun install
cd apps/web
cp .env.example .env.local
bun run dev
```

With `next dev` **or** `next start`, opening **`http://127.0.0.1:3000`** or **`http://localhost:3000`** uses **loopback OAuth automatically** (no fetch to `latr.link` for client metadata). You do **not** need `NODE_ENV=development` for that. Optional `apps/web/.env.local` from `.env.example` tweaks timeouts and redirects.

### Local OAuth (development)

Loopback OAuth must use a `client_id` that includes your `/callback` path and repo scopes. `apps/web/.env.local` should set `NEXT_PUBLIC_APP_ENV=local` (already in `.env.example`).

Vercel production builds default to `prod`, previews to `dev`. Other hosts must set `NEXT_PUBLIC_APP_ENV` explicitly. See **`apps/web/.env.example`** for **`prod`** / **`local`** / **`dev`** behavior.

Prefer **`http://127.0.0.1:3000`** in the browser so the redirect URI matches ATProto loopback rules (see `@atproto/oauth-client-browser` README — the library may rewrite `localhost` to loopback IP).

Optional environment variables (see `apps/web/.env.example`):

- `NEXT_PUBLIC_LOCAL_REDIRECT_URI` — if your dev URL is not the default `http://127.0.0.1:<port>/callback`.
- `NEXT_PUBLIC_LOCAL_OAUTH_CLIENT_ID` — full custom loopback `client_id` URL (advanced override).
- `NEXT_PUBLIC_AUTH_RESTORE_TIMEOUT_MS` — cap OAuth/IndexedDB restore wait in ms (default 8000) so the UI cannot stay on “Loading…” forever in embedded or broken browsers.

### WebSocket / HMR errors in an embedded browser

If the console shows `WebSocket connection to .../_next/webpack-hmr` failures, hot reload may not work in that environment; the app should still load. Use an external browser if the page stays blank after refresh.

### Commands (repo root)

| Script | Description |
|--------|-------------|
| `bun run dev` | Turbo dev (web app) |
| `bun run build` | Production build |
| `bun run lint` | ESLint |
| `bun run typecheck` | TypeScript |
| `bun run test` | Unit tests (workspace) |

## iPhone and iPad app

The native app and Share Extension live in [apps/apple](apps/apple/README.md).
With Xcode 26+ and XcodeGen installed, generate and open the project:

```sh
cd apps/apple
xcodegen generate
open LatrLink.xcodeproj
```

Use the `LatrLink` scheme. Debug targets Development; Release targets Production.
Run `bash scripts/ci-apple.sh` from the repository root for core tests, a Release
simulator build, icon validation, and iPhone/iPad UI tests. The Xcode project is
generated and ignored; edit `apps/apple/project.yml` for persistent project changes.

## Architecture

See [docs/architecture/overview.md](docs/architecture/overview.md).

Deployment and database cutover procedures live in
[docs/deployment/vercel-migration.md](docs/deployment/vercel-migration.md).

## Lexicons

Canonical `link.latr.*` schemas live in **[CountableNewt/latr-packages](https://github.com/CountableNewt/latr-packages)**. Current records use `community.lexicon.bookmarks.bookmark` and `link.latr.bookmarks.metadata`; legacy records are migrated through the current bookmark API.

For Go development, configure `services/go-backend/.env.example` values in your shell, apply the Turso schema with `python3 scripts/turso-migrate.py`, and run `go run ./cmd/gateway` from that directory. Use `bash scripts/ci.sh` for Go and JavaScript checks.
