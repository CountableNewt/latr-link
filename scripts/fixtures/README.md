# Legacy migration fixtures

`legacy-gateway-sqlite-schema.sql` preserves the final Swift gateway SQLite schema for read-only backup migration tests and offline recovery with `migrate-gateway-to-sqlite.py`. It contains schema definitions only.

The Go gateway applies `services/go-backend/migrations/001_operational.sql` to Turso. Retired developer clients, API keys, usage records, and old replay claims must not be imported into the hosted Go services; `turso-migrate.py` copies only unexpired public preview cache entries.
