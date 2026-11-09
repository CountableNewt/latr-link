# Railway deployment and cutover

Railway hosts L@tr.link in one project with isolated `dev` and `production`
environments. GitHub Actions verifies code; Railway's GitHub integration deploys
the linked branch after its own successful build.

| Environment | Branch | Web | Gateway | Developer console |
| --- | --- | --- | --- | --- |
| Development | `dev` | `testing.latr.link` | `api.testing.latr.link` | `testing.latrkit.dev` |
| Production | `main` | `latr.link` | `api.latr.link` | `latrkit.dev` |

Each environment contains `Web`, `Gateway`, and `LatrKit Developer Console`.
The SQLite configuration requires an environment-local persistent volume mounted
at `/data` on Gateway and exactly one Gateway replica. Config-as-code lives in
`railway/*.json`; service root directories stay at `/`. The former Postgres
service stays available during cutover and rollback verification. This runbook
describes the target configuration; repository changes alone do not migrate live data.

## Required variables

Gateway:

- `APP_ENV=dev|prod`
- `PORT=8080`
- `LATR_GATEWAY_DATABASE_BACKEND=sqlite`
- `LATR_GATEWAY_SQLITE_PATH=/data/latr-gateway.sqlite`
- Gateway persistent volume mounted at `/data`; one replica
- `OAUTH_PUBLIC_ORIGIN` set to the environment Web origin
- `OAUTH_LATRKIT_PUBLIC_ORIGIN` set to the environment console origin
- `LATR_GATEWAY_REQUIRE_CLIENT_API_KEY=true` in Production

Web:

- `APP_ENV` and `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_LATR_GATEWAY_URL` set to the public environment Gateway origin
- `LATR_GATEWAY_INTERNAL_URL=http://${{Gateway.RAILWAY_PRIVATE_DOMAIN}}:8080`
- server-only `LATR_GATEWAY_CLIENT_ID` + `LATR_GATEWAY_API_KEY`

Developer Console:

- `APP_ENV` and `NEXT_PUBLIC_APP_ENV`
- `NEXT_PUBLIC_LATR_GATEWAY_URL` set to the public environment Gateway origin

Do not put gateway API keys in `NEXT_PUBLIC_*` variables.

## SQLite startup and backups

Gateway initializes/version-checks its SQLite schema during application startup,
after the persistent volume is mounted. Railway pre-deploy containers do not
mount service volumes, so there is no SQLite pre-deploy migration command.
The container entrypoint prepares volume ownership, then drops to `nobody`.
WAL journaling, full synchronous writes, foreign keys, and a busy timeout are
configured by the application. Deployment must use a single replica and a single
environment-specific volume; do not share the file across replicas or hosts.

Back up a running instance using SQLite's online backup command; copying the
main file alone while WAL is active can lose committed data:

```bash
sqlite3 /data/latr-gateway.sqlite ".backup '/data/gateway-backup.sqlite'"
sqlite3 /data/gateway-backup.sqlite 'PRAGMA integrity_check; PRAGMA foreign_key_check;'
```

Download backups off the service volume and retain them before releases. A volume
snapshot is also useful, but must include the database and its WAL consistently.

## Postgres to SQLite cutover

The gateway database contains developer clients, API-key hashes and revocations,
daily usage counters, and derived bookmark previews. Saved community bookmark
records and their metadata sidecars remain on each user's PDS.

For each environment, Development first:

1. Build and test the SQLite revision before changing hosted configuration.
2. Capture a Postgres backup and freeze Gateway writes by stopping the old Gateway.
   Keep Web and console in maintenance during the freeze so no key issuance or
   usage writes occur between the final snapshot and switching databases.
3. From a trusted machine with `psql`, set `DATABASE_URL` to the source connection
   privately (do not paste credentials into logs). Run:

   ```bash
   python3 scripts/migrate-gateway-to-sqlite.py \
     --export-json /private/backup/latr-source.json \
     --output /private/backup/latr-gateway.sqlite
   ```

   The script takes a single read-only repeatable-read snapshot of all four tables,
   retains it with mode `0600`, builds a new private SQLite file from the same
   schema used by Gateway, verifies every row/field plus integrity/foreign keys,
   and publishes the destination atomically. It refuses existing output paths.
   The runtime image also includes `python3 /usr/local/bin/migrate-gateway-to-sqlite`
   for a private-network maintenance session with the same schema resource.
   It prints counts only. For an offline retry, pass `--source-json` instead of
   connecting to Postgres. Hash the snapshot and SQLite artifact for the cutover log.
4. Attach the environment-specific `/data` volume to Gateway. Transfer the verified
   file to `/data/latr-gateway.sqlite` while Gateway is stopped; confirm the file
   checksum matches. Never replace a file while an SQLite process has it open.
5. Set the SQLite variables above, remove the old Postgres pre-deploy override if
   configured in the dashboard, and deploy the tested revision. `DATABASE_URL`
   may remain temporarily only with the explicit `sqlite` backend selection.
6. Verify `/health`, authentication with existing API keys, rejection of revoked
   keys, console client/key lists, key issuance/revocation, daily limits and usage,
   bookmark save/list/archive/delete, and preview reads. Compare all four row
   counts before issuing mutations. Restart Gateway and repeat persistence checks.
7. Resume traffic and observe Development before scheduling Production. Retain
   Postgres and backups until acceptance and an agreed rollback window have passed.
   Postgres teardown is a separate destructive action.

Rollback before accepting new SQLite writes: stop Gateway, select
`LATR_GATEWAY_DATABASE_BACKEND=postgres` with the original `DATABASE_URL`, then
run the previous tested revision or the retained Postgres backend. Legacy Postgres
schema upgrades still use `scripts/apply-database-migrations.sh` explicitly.
After SQLite accepts writes, Postgres is stale: freeze traffic and reconcile all
new client/key/revocation/usage changes before rollback. Never blindly route back
to the old snapshot; doing so can reactivate revoked keys or lose newly issued keys.

## DNS sequence

Register Railway custom domains first. Add Railway's `_railway-verify` TXT
records while the existing CNAME/A records still serve the old provider. Wait
for ownership verification, then update only the traffic records. Railway may
not begin certificate issuance until its CNAME is serving; monitor HTTPS during
that short window and restore the captured records if issuance fails.
For nested `api.testing.latr.link`, use DNS-only mode unless the Cloudflare zone
has certificate coverage for nested subdomains.

## Historical Railway provider cutover (August 2026)

Production moved to Railway on August 3, 2026 after Development passed the full
test plan. `latr.link`, `api.latr.link`, and `latrkit.dev` now route to the
Railway `production` environment from `main`. The legacy Vercel projects are
deleted, both Fly Gateway apps are destroyed, and the Development and Production
Supabase projects are deleted. Cloudflare remains authoritative for DNS and all
application traffic terminates at Railway.

The final frozen database export had SHA-256
`f7842195bbb2ab821475b3befff794b95b01e95ac5e1c2913e054a561f7fec5c`.
The restore preserved 2 developer clients, 3 API keys, and 121 daily usage rows
with no orphaned records. Cutover added one Railway-only Web API key, so the
post-cutover key count is 4. The raw key exists only in Railway; the database
stores its SHA-256 hash. Exact pre-cutover Cloudflare zone exports and database
exports remain in the operator recovery directory for audit and disaster
recovery; the deleted providers are no longer rollback targets.

The historical provider-cutover procedure was:

1. Snapshot and count the source tables; verify the dump checksum.
2. Stop the old Fly Gateway to freeze client/key/usage writes.
3. Take a final data-only snapshot after the freeze and restore it into the
   migrated Railway Production database.
4. Re-run count, foreign-key, and migration-ledger checks.
5. Deploy Railway Production from `main`, verify generated Railway domains, and
   confirm credentials through an authenticated probe.
6. Switch `api.latr.link`, `latr.link`, and `latrkit.dev` traffic records only
   after Railway ownership/TLS is active.
7. Verify health, OAuth metadata, sign-in, list/save/archive/delete, API-key
   creation, and database persistence across a Gateway restart.
8. After explicit owner approval, verified backups, and successful production
   validation, delete the Vercel projects/domain registrations, Fly apps, and
   Supabase projects. Keep the exports even after provider teardown.
