# LatrKit developer console (`latrkit.dev`)

Developer-facing Next.js app at [`apps/latrkit-dev`](../apps/latrkit-dev). Operators sign in with ATProto OAuth, create gateway clients, issue usage-based API keys (`X-Latr-Client-Id` + `X-Latr-API-Key`), and review usage counters.

## Local development

```bash
# Terminal 1 — gateway
cd services/latr-gateway && swift run LatrGateway

# Terminal 2 — console (port 3001)
cd apps/latrkit-dev && bun run dev
```

Sign in at `http://127.0.0.1:3001`. Management routes use OAuth only (no app API key on console calls).

## Gateway configuration

| Variable | Description |
|----------|-------------|
| `OFFICIAL_CLIENT_DID` | ATProto DID allowed to provision **official** clients via `/v1/latr/developer/official/clients` |
| `DATABASE_URL` | Supabase Postgres URL — apply [`migrations/001_developer_console.sql`](../services/latr-gateway/migrations/001_developer_console.sql) |
| `LATR_GATEWAY_DEVELOPER_STORE_PATH` | JSON persistence for clients/keys/usage (default `./data/developer-store.json`) |

## Console environment

See [`apps/latrkit-dev/.env.example`](../apps/latrkit-dev/.env.example).

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_LATR_GATEWAY_URL` | LatrKit gateway base URL |
| `NEXT_PUBLIC_OFFICIAL_CLIENT_DID` | When it matches the signed-in DID, shows the official-client provisioner UI |
| `NEXT_PUBLIC_ATPROTO_CLIENT_ID` | Hosted OAuth metadata URL (e.g. `https://latrkit.dev/client-metadata.json`) |

Stripe billing is **not** wired in this slice; usage limits run in developer preview until billing is enabled.
