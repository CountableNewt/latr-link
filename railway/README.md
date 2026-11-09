# Railway deployment configuration

Railway is the canonical deployment platform for Development and Production.
GitHub Actions validates source changes; Railway deploys linked revisions through
its GitHub integration.

Each service keeps the monorepo root directory at `/` and selects its exact
config-as-code file:

| Railway service | Config file | Port |
| --- | --- | --- |
| Web | `/railway/web.json` | Railway-injected `PORT` |
| LatrKit Developer Console | `/railway/latrkit-dev.json` | Railway-injected `PORT` |
| Gateway | `/railway/gateway.json` | `8080` |

Development tracks the `dev` branch; Production tracks `main`. Gateway uses
SQLite on an environment-local persistent volume mounted at `/data`, with
`LATR_GATEWAY_DATABASE_BACKEND=sqlite` and
`LATR_GATEWAY_SQLITE_PATH=/data/latr-gateway.sqlite`. Run one Gateway replica.
Schema migrations happen during application startup after volume mount, rather
than in a Railway pre-deploy container. Follow the [cutover runbook](../docs/deployment/railway.md)
to preserve existing developer data and verify backups before switching live services.

The Web service reaches Gateway privately with
`LATR_GATEWAY_INTERNAL_URL=http://${{Gateway.RAILWAY_PRIVATE_DOMAIN}}:8080`.
Browsers and the Developer Console use the environment's public Gateway custom
domain because Railway private DNS is not browser-accessible.
