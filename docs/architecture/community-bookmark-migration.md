# Community bookmarks and legacy migration

## Current records

`community.lexicon.bookmarks.bookmark` is the authoritative bookmark record.
New bookmarks use TID record keys. The user-owned `link.latr.bookmarks.metadata`
sidecar uses the same key and binds the exact bookmark URI and subject. The
community record contains `subject`, `createdAt` and optional `tags`; reading
state, notes, last-opened time and migration provenance belong in the sidecar.
Updates preserve unknown fields and use CID guards on the user's PDS.

The Go gateway exposes bookmark and tag operations under `/xrpc/link.latr.bookmarks.*`.
Views return the community record plus optional `metadataRecord` and derived
`preview`. Turso stores derived preview cache and atomic DPoP replay claims,
with separate preview and production databases. It has no developer registry,
API-key table or authoritative user bookmarks. See [gateway contracts](latr-gateway.md)
for the current routes and HTTP verbs.

## Tags and reconciliation

Authored tag boundaries are trimmed; empty tags are rejected. Case and internal
whitespace are preserved, and exact duplicates collapse in first-seen order.
A bookmark accepts at most 100 tags, each limited to 64 graphemes and 640 UTF-8
bytes. `listBookmarks?tag=` filters the current bounded bookmark page, so an
empty filtered page can still have a cursor. `listTags` counts tags within one
page of at most 100 scanned bookmarks; clients merge counts across pages.

`setTags` replaces the full tag array with a CID-guarded write. `renameTag` and
`deleteTag` scan at most 25 bookmarks per request and return
`{ ok, scanned, matched, updated, cursor? }`. Resume until the cursor is absent;
its verification phase checks that no source-tag records remain. A conflict
fails the current request; earlier successful requests remain applied.

`syncMetadata` is an idempotent procedure for community bookmarks written by
other clients. It scans one page of at most 100 bookmarks, creates missing
same-key sidecars with an unread state, preserves matching sidecars and leaves
mismatched sidecars untouched. Clients can invoke reconciliation before listing
without hiding community bookmarks when reconciliation temporarily fails.
Schema-invalid community records are omitted from reads without modifying them;
repository cursors remain available for continued pagination.

## Legacy record migration

`migrateLegacy` scans `com.latr.saved.*` and `link.latr.saved.*`. External wrappers
retain their encountered HTTP(S) URL, falling back to `normalizedUrl`. Native
items use an HTTP(S) `linkedWebUrl` when available, otherwise their AT URI.

Legacy items are grouped by exact subject. Migration reuses the oldest existing
community bookmark (URI breaks timestamp ties), or creates a new TID bookmark.
It merges tags deterministically, keeps the oldest creation time and latest
`lastOpenedAt`, preserves existing sidecar state/note and records legacy item
URIs. Conflicting notes or unknown legacy fields skip the group rather than
risk data loss. CID conflicts also increment `skippedConflict` and retain the
source group for a later retry.

Each group's target writes and source deletes share one
`com.atproto.repo.applyWrites` transaction. Requests process at most 100 subject
groups (default 25), returning a subject cursor when more remain. The service
still scans the legacy collections to form groups; the limit bounds processed
groups, not the initial repository scan. Continue with the returned cursor,
inspect `skippedConflict`, and rerun from the beginning after resolving skipped
groups. A completed rerun should be a no-op for successfully retired records.

Legacy `/v1/latr/*`, `link.latr.saved.*` and developer-management endpoints are
retired with HTTP 410. They are not compatibility mutation adapters. Published
OAuth metadata retains legacy delete scopes for migration; keep client scope
changes aligned and require reauthentication after changing them.

## Verification

Use a branch preview in the same Vercel project as production, with its own
Turso credentials. Verify representative wrapper, linked-web and direct-AT
records, repeat migration, and inspect both PDS collections. Exercise tag
pagination and resume mutation cursors through verification, including CID
conflicts. Follow [deployment guidance](../deployment/vercel-migration.md);
Railway is historical rollback infrastructure, not the active development host.
