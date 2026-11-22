# Legacy migration fixtures

`legacy-gateway-sqlite-schema.sql` preserves the final Swift gateway SQLite schema for the Turso migration tests, which verify that retired developer clients and keys are excluded from cache transfers. It contains schema definitions only. Historical offline recovery tooling is available in Git at revision `009e734`.

The explicit `scripts/turso-migrate.py` operation applies `services/go-backend/migrations/001_operational.sql` to Turso. Retired developer clients, API keys, usage records, and old replay claims must not be imported into the hosted Go services; `turso-migrate.py` copies only unexpired public preview cache entries.
