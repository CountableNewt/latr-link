# L@tr gateway

L@tr.link deploys a Next.js frontend and two Go services together in one Vercel Services project. Git branch previews include matching frontend/backend revisions; `main` owns production. The Swift hosted server and public developer console are retired. Native Swift apps continue to use the remote LatrKit client library.

## Ownership and storage

`community.lexicon.bookmarks.bookmark` is authoritative for bookmarks. `link.latr.bookmarks.metadata` stores user state on the same PDS with the same record key. Unknown fields and optimistic CID checks are preserved during updates. Schema-invalid bookmark records are omitted from reads without changing their source records; pagination cursors are preserved even for empty filtered pages.

Turso stores only derived seven-day previews and atomic DPoP replay claims. Preview and production use separate databases. There is no developer account, key issuance, billing or usage registry. Existing first-party key hashes live in internal server configuration only.

## Services

| Service | Responsibility | Local command |
| --- | --- | --- |
| gateway | Bookmark/tag/state operations, PDS writes, legacy record migration | `cd services/go-backend && go run ./cmd/gateway` |
| metadata | Bounded SSRF-protected Open Graph, discovery and federated previews | `cd services/go-backend && go run ./cmd/metadata` |
| web | Next.js UI, OAuth metadata and server-only credential proxy | `bun run --cwd apps/web dev` |

The Go services share auth, PDS transport and metadata packages. They do not call a network auth service or validate the same DPoP proof twice. Save-time enrichment uses the metadata package locally; standalone metadata requests route to the metadata service.

## Authentication

Each operational XRPC call requires an internally configured first-party credential and the viewer's ATProto OAuth token plus DPoP proof. Health/readiness and public OAuth metadata are separate routes; cleanup requires `CRON_SECRET`. Split headers are `X-Latr-Client-Id` and `X-Latr-API-Key`; `X-Latr-Official-Client` remains supported for internal callers. There is no registration endpoint or database key lookup. `LATR_GATEWAY_OFFICIAL_CLIENT_CREDENTIALS` holds `client-id=secret` pairs, separated by commas or semicolons. A `|`-separated credential list supports overlapping rotation; `sha256:<hex>` entries retain existing internal hashes. Invalid entries, duplicate IDs, empty rotation values and invalid hashes fail startup. Configure matching credentials only on calling servers; never put them in browser bootstrap or distributed clients.

The web app uses its same-origin `/api/latr-gateway/*` proxy. Native clients and store extension builds call the hosted proxy without embedding its internal credential. It injects server credentials and signs the public method/URL with `LATR_GATEWAY_PROXY_SECRET`; Go validates that HMAC before using the public URL for DPoP binding across Vercel's internal hop. Never expose official credentials or the proxy key as `NEXT_PUBLIC_*`.

The verifier binds the access token issuer to the viewer's DID-discovered PDS authorization servers, checks token expiry/signature/key binding and request method/URL/token hash, and claims each proof atomically in Turso. Unsupported public token verification falls back to PDS authority checks; enrichment/auth probes attest the PDS session. Every authenticated upstream call consumes its own correctly targeted client-minted proof.

## Current APIs

All operational methods use `/xrpc/`:

| Method | NSID |
| --- | --- |
| GET | `link.latr.bookmarks.listBookmarks`, `listTags`, `getBookmark` |
| POST | `link.latr.bookmarks.saveBookmark`, `syncMetadata`, `setTags`, `renameTag`, `deleteTag`, `deleteBookmark`, `migrateLegacy` |
| PATCH | `link.latr.bookmarks.setState` |
| GET | `link.latr.preview.getOpenGraph`, `link.latr.discovery.resolveUrl`, `link.latr.auth.probe` |

Bookmark NSIDs without a full prefix in the table use `link.latr.bookmarks.`. The hosted `setState` route currently requires PATCH, while the canonical native client method describes POST; native transport retains an explicit PATCH override. Preserve this compatibility until the contract and gateway change together. Legacy `/v1/latr/*`, `link.latr.saved.*` and `link.latr.developer.*` return 410 and have no operation handlers. The old Next.js `/api/og-preview` and `/api/at-uri-from-url` fetch endpoints are removed.

Input validation is generated from the pinned canonical `latr-packages` dependency by `scripts/generate-go-contracts.py`; do not copy lexicon JSON into this repository. Query/property/verb/size checks and private no-store responses are enforced at the gateway. Migration proof pools can use the `upstreamDpopProof` JSON transport field to avoid proxy header limits.

## Deployment and operations

See [Vercel migration and cutover](../deployment/vercel-migration.md) and the [environment template](../../services/go-backend/.env.example). Schema application and read-only SQLite cache transfer use `scripts/turso-migrate.py`. The daily authenticated cleanup job bounds expired claim/cache deletion. `/health` checks the process; `/ready` checks its operational store.

The server uses a 55-second application deadline. Vercel manages ingress socket lifetimes; standalone servers retain normal HTTP timeouts. Public pages/library shells prerender statically; API and OAuth metadata routes remain dynamic. Preview OAuth metadata must be fetchable without Vercel Authentication, so only the selected branch domain gets an exception.

The historical Railway runbook is retained solely for rollback evidence. The old Swift server source is available in Git history at `009e734`; legacy schema and metadata fixtures are preserved as tests.
