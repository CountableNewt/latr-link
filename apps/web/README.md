# L@tr.link web

Next.js 16 web client for L@tr.link. Use Bun 1.3.14 and run from the monorepo root:

```sh
bun install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
bun run --cwd apps/web dev
```

Open `http://127.0.0.1:3000` for loopback ATProto OAuth. Loopback metadata also
works with `next start`; it does not require `NODE_ENV=development`.
See [the environment template](.env.example) for timeouts and OAuth overrides.
Local library operations also require the Go services, a configured operational
store and matching internal credentials; see the [root setup guide](../../README.md).

## Hosted topology

One Vercel Services project deploys this frontend and the Go gateway/metadata
services. `main` owns Production; branches get matching Preview deployments.
`testing.latr.link` and `api.testing.latr.link` are aliases of a selected branch
preview, not a separate Development project. Vercel builds default to `prod`
for Production and `dev` for Preview; explicit `NEXT_PUBLIC_APP_ENV` or `APP_ENV`
overrides these defaults. Other hosts must configure the environment explicitly.

The browser always calls its own origin's `/api/latr-gateway/*` proxy. Service
bindings provide server-only `LATR_GATEWAY_INTERNAL_URL` and
`LATR_METADATA_INTERNAL_URL`; hosted requests fail closed without the gateway
binding or `LATR_GATEWAY_PROXY_SECRET`. The proxy forwards viewer OAuth/DPoP,
injects the internal client secret, and signs the original method/URL for Go.

Configure either `LATR_GATEWAY_CLIENT_CREDENTIAL`, or the paired
`LATR_GATEWAY_CLIENT_ID` / `LATR_GATEWAY_API_KEY`, to match the gateway's
`LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS`. These are internal environment
secrets; there is no public registration or key database. Never put them in
`NEXT_PUBLIC_*` or browser bootstrap. The bootstrap contains only URL/environment
configuration.

Public pages and library shells prerender; authenticated proxy calls remain
private/no-store. OAuth metadata is served dynamically for the requesting origin.
Production-only Vercel Web Analytics is configured in the root layout.

## Checks

```sh
bun run --cwd apps/web test
bun run --cwd apps/web lint
bun run --cwd apps/web typecheck
bun run --cwd apps/web build
```

Use `bash scripts/ci.sh` at the repository root for the full Go and JavaScript
checks. See [Vercel operations](../../docs/deployment/vercel-migration.md) for
service routing, preview metadata protection exceptions and Turso isolation.
The [Railway runbook](../../docs/deployment/railway.md) is historical rollback
reference only.
