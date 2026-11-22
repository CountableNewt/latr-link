# L@tr.link

ATProto read-later with bookmarks and reading state on your own PDS. The Next.js
web app and two Go services deploy together on Vercel. Turso stores derived
previews and DPoP replay claims. Internal client authentication uses server
environment secrets; public developer registration and database-issued keys are
retired.

## Repository

| Path | Purpose |
| --- | --- |
| `apps/web` | Next.js web app and same-origin credential proxy |
| `apps/extension` | Chromium/Firefox browser extension |
| `apps/apple` | iPhone/iPad app, share extension, native core, tests and icon tooling |
| `packages/latr-web-client` | Shared web/extension client helpers |
| `packages/native-contracts` | Generated native contract fixtures |
| `packages/native-brand` | Shared brand source assets |
| `services/go-backend` | Go bookmark gateway and metadata service |

All maintained Swift source lives under `apps/apple`. Its core Swift package
supports iOS and macOS; the generated application targets are currently iOS.
LatrKit and canonical `latr-packages` contracts resolve through pinned remote
dependencies.

## Local development

Install Bun **1.3.14**, Go **1.24+** (see `services/go-backend/go.mod`) and Python 3.
Native development also needs macOS, Xcode 26+ and XcodeGen.

```sh
bun install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
cp services/go-backend/.env.example services/go-backend/.env.local
```

Edit the backend env file with a development Turso database/token, an internal
client secret (`LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS=latr-link-web=<secret>`),
and a random `LATR_GATEWAY_PROXY_SECRET`. Use a database separate from production.
The Go process does not load env files automatically. Load it into your shell and
apply the operational schema from the repository root:

```sh
set -a
. services/go-backend/.env.local
set +a
python3 scripts/turso-migrate.py
cd services/go-backend
go run ./cmd/gateway
```

In a second shell, load the same backend env file and run the metadata service
from `services/go-backend` with `PORT=8081 go run ./cmd/metadata`.

In `apps/web/.env.local`, retain `NEXT_PUBLIC_APP_ENV=local` and configure:

```dotenv
LATR_GATEWAY_INTERNAL_URL=http://127.0.0.1:8080
LATR_METADATA_INTERNAL_URL=http://127.0.0.1:8081
LATR_GATEWAY_CLIENT_ID=latr-link-web
LATR_GATEWAY_API_KEY=<same internal client secret>
LATR_GATEWAY_PROXY_SECRET=<same proxy secret>
```

Start the web app from the repository root:

```sh
bun run --cwd apps/web dev
```

Open **http://127.0.0.1:3000** in Chrome. Loopback OAuth activates on localhost
and 127.0.0.1 for both `next dev` and `next start`; it does not require
`NODE_ENV=development`. Browser requests stay on `/api/latr-gateway/*`; the proxy
injects internal credentials. Never put client secrets in `NEXT_PUBLIC_*` or the
browser bootstrap. See [web setup](apps/web/README.md) and the env template for
optional OAuth timeouts, redirects and local demo data.

## Checks and builds

| Command (repository root) | Scope |
| --- | --- |
| `bash scripts/ci.sh` | Go race tests/vet/build, migration and generated-contract checks, JS tests/lint/typechecks/builds |
| `bash scripts/ci-apple.sh` | Native core tests, iOS Release simulator build, icon checks, iPhone/iPad UI tests |
| `bun run build` | JavaScript workspace builds; Go/native builds use the CI scripts above |
| `bun run lint` / `bun run typecheck` / `bun run test` | JavaScript workspace checks |
| `bun scripts/native-contracts.ts --check` | Native fixture parity with canonical contracts |
| `bun run clean:swift` | Apple SwiftPM build-artifact cleanup |

GitHub Actions runs Go, web/extension and native checks for PRs and `main`/`dev`
pushes. It does not deploy infrastructure or connect to hosted databases.
Vercel Git integration deploys branch previews and `main` production.

## Documentation

- [Architecture](docs/architecture/overview.md) and [gateway API/auth](docs/architecture/latr-gateway.md)
- [Bookmark migration](docs/architecture/community-bookmark-migration.md) and [contract ownership](docs/architecture/xrpc-external-rollout.md)
- [Deployment, secrets and Turso operations](docs/deployment/vercel-migration.md)
- [Apple app](apps/apple/README.md), [browser extension](docs/apps/extension.md) and [store packaging](apps/extension/store/BUILD.md)
- [Retired developer console](docs/apps/latrkit-dev.md) and [historical Railway recovery](docs/deployment/railway.md)

Canonical schemas live in [CountableNewt/latr-packages](https://github.com/CountableNewt/latr-packages).
Bookmarks use `community.lexicon.bookmarks.bookmark`; durable reading state uses
`link.latr.bookmarks.metadata`. Do not duplicate lexicon schemas in this repo.
