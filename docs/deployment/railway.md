# Historical Railway recovery

Railway is retired for this repository. The recorded November 22, 2026 cutover
stopped Web, Gateway, Developer Console and Postgres in both environments after
Vercel acceptance and DNS drain. Git sources were disconnected; services,
volumes and backups were retained. This is historical evidence, not a current
Railway deployment recipe. See [active Vercel operations](vercel-migration.md).

## Recovering an old deployment

The matching Swift gateway, Railway config and Postgres-to-SQLite migration tool
are available in Git at revision `009e734`. Inspect that revision in an isolated
checkout when recovering an old backup. Paths such as `railway/*.json`,
`services/latr-gateway/Package.swift`, the developer console and
`migrate-gateway-to-sqlite.py` do not exist in current maintained source.

The historical SQLite gateway required an environment-specific persistent
volume at `/data`, a single replica, and a matching schema/runtime. It held
developer clients, key hashes, usage and previews. Current Go code cannot be
pointed at that file as its database. Retained credentials and old database data
must not be exposed through a restored public registration service.

For an online SQLite backup, use SQLite's backup API/CLI rather than copying the
main file without its active WAL:

```sh
sqlite3 /data/latr-gateway.sqlite ".backup '/data/gateway-backup.sqlite'"
sqlite3 /data/gateway-backup.sqlite 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

Keep backups outside the service volume. Historical local cutover data under
`services/latr-gateway/data` and retained snapshots under
`services/go-backend/data/retained-backups` are ignored and must remain private.
The retired `.build` cache was removed; it is not a recovery artifact.

## Current migration boundary

Apply `services/go-backend/migrations/001_operational.sql` with
`scripts/turso-migrate.py`. Its optional read-only SQLite import copies only
unexpired preview cache entries; it excludes developer clients, keys, usage and
replay claims. User bookmarks and reading metadata remain on the user's PDS.

A rollback after new PDS writes needs compatibility review; restoring an old
operational database does not roll back user records. Do not restore legacy
runtime/DNS routes based on this archival page alone. Recheck backups, current
PDS contracts, client OAuth metadata, credentials and the intended recovery
revision before any recovery operation.
