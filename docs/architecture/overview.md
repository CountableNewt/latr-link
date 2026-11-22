# L@tr architecture

## Components

- **Web (`apps/web`)** — Next.js frontend with browser ATProto OAuth and a same-origin credential proxy.
- **Go backend (`services/go-backend`)** — Bookmark gateway and metadata service with OAuth/DPoP verification, PDS operations, previews and URL discovery.
- **Apple app (`apps/apple`)** — iOS/macOS app, share extension, core library, tests and icon tooling. The remote Swift LatrKit dependency is used only by native clients.
- **Browser extension (`apps/extension`)** — Saves through the hosted credential proxy.
- **`latr-packages`** — Canonical TypeScript gateway contracts, record keys and lexicons, pinned as a remote dependency.
- **`packages/latr-web-client`** — Shared web/extension gateway and save helpers.

The hosted Swift server and public developer console are retired. Their source
is retained in Git history at `009e734`.

## Data ownership and authentication

Bookmarks live in `community.lexicon.bookmarks.bookmark` on the user's PDS;
reading state lives in `link.latr.bookmarks.metadata`. Turso stores derived
preview cache and atomic DPoP replay claims. OAuth tokens stay in client session
storage. Client secrets are internal server environment configuration.

Clients call the deployment-local `/api/latr-gateway/*` proxy, which forwards
viewer OAuth/DPoP and injects internal credentials. Go reads and mutates the
user's PDS, preserving unknown fields and using optimistic concurrency.
Canonical record keys and upstream proof pools come from `latr-packages`.

OAuth scopes must match the published client metadata. Users must re-authenticate
after scope changes. See [gateway contracts](latr-gateway.md),
[Apple app](../../apps/apple/README.md) and
[Vercel deployment](../deployment/vercel-migration.md).
