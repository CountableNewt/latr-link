# L@tr architecture

## Components

- **Web (`apps/web`)** — Next.js App Router, ATProto OAuth in the browser, XRPC to the user’s PDS via `@atproto/api` `Agent` + OAuth session.
- **`packages/latr-kit`** — URL normalization, deterministic record keys (`rkey`), shared TypeScript types aligned with the lexicons.
- **`packages/lexicons`** — Lexicon JSON for `com.latr.saved.external` and `com.latr.saved.item`.

```mermaid
flowchart LR
  Browser[L@tr_web]
  PDS[User_PDS]
  AppView[Bluesky_AppView]
  Browser -->|"OAuth_DPOP"| PDS
  Browser -->|"public_reads"| AppView
```

## Data ownership

| Data | Location |
|------|----------|
| Saved items | `com.latr.saved.item` on the user’s repo |
| External URL wrappers | `com.latr.saved.external` on the user’s repo |
| Session tokens | OAuth client browser storage (IndexedDB / memory) |
| Optional UI cache | Browser `localStorage` / memory (React Query persistence) |

No Stygian server is required for listing, save, or unsave.

## Flows (summary)

1. **Save external URL** — Normalize URL → upsert `com.latr.saved.external` (deterministic rkey) → upsert `com.latr.saved.item` with `subjectUri` pointing at that wrapper.
2. **Save ATProto record** — Upsert `com.latr.saved.item` with `subjectUri = at://.../collection/rkey`.
3. **List** — `com.atproto.repo.listRecords` on `com.latr.saved.item`, then resolve each `subjectUri` (get wrapper or fetch post preview via App View where applicable).
4. **Unsave** — `com.atproto.repo.deleteRecord` on the `com.latr.saved.item` rkey.

## OAuth scopes

Repository writes require explicit `repo:` scopes for both collections, aligned with `apps/web/public/client-metadata.json`.
