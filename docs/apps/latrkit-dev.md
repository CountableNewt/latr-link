# Retired developer console

The LatrKit developer console and public client/API-key registration service are retired. The `apps/latrkit-dev` application has been removed from this repository and its build pipeline.

L@tr.link bookmarks remain on the signed-in user’s PDS. The application uses the bookmark XRPC service with viewer OAuth/DPoP and server-configured official credentials; it does not issue developer API keys.

Provisioned developer credentials are no longer resolved from a database. Selected existing first-party credentials remain accepted only through internal environment configuration, including retained hashes for rotation. No developer account or key issuance API is deployed.

The completed Vercel cutover redirected `latrkit.dev` and `testing.latrkit.dev` to `latr.link` and stopped the former Railway console services. Retained Railway configuration, volumes and backups are historical rollback resources. See [cutover evidence](../deployment/vercel-migration.md).
