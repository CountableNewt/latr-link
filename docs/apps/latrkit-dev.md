# Retired developer console

The LatrKit developer console and public client/API-key registration service are retired. The `apps/latrkit-dev` application has been removed from this repository and its build pipeline.

L@tr.link bookmarks remain on the signed-in user’s PDS. The application uses the bookmark XRPC service with viewer OAuth/DPoP and server-configured official credentials; it does not issue developer API keys.

Existing developer credentials are no longer accepted by the migrated backend. Retiring the source does not shut down a hosted Railway service: remove its domains and stop the service during the verified hosting cutover.
