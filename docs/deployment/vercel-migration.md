# Go and Vercel migration

Status: implementation in progress; Railway remains authoritative until cutover checks pass.

## Decisions

- Replace the hosted Swift gateway with Go bookmark and metadata services, sharing auth and PDS packages.
- Keep native Swift apps and LatrKit as client libraries. Retire the public latrkit.dev console and developer client/key registration API. Official credentials remain internal server configuration.
- Use one Vercel Hobby project for L@tr.link, production from `main`, with branch-scoped preview deployments. No separate Dev project.
- Keep user bookmarks and metadata on the user's PDS. Use Turso Free for preview cache and atomic DPoP replay claims. Separate preview and production databases and credentials.
- Next.js 16 already uses Turbopack by default. Preserve static public pages and never cache authenticated responses across users.
- Non-commercial use confirmed by the owner on 2026-11-22.

## Work and acceptance

- [ ] Port and test auth, PDS operations, bookmark/tag APIs, legacy adapters and metadata behavior.
- [ ] Remove public registration and retire developer console from deployment/build.
- [ ] Make browser API calls deployment-local and verify OAuth metadata is publicly fetchable in previews.
- [ ] Configure Services routing, server-only credentials, production and branch preview isolation.
- [ ] Run Go race/vet/build, JavaScript tests/lint/typecheck/build and Chrome acceptance.
- [ ] Rehearse SQLite preview-cache transfer to Turso; exclude retired developer credentials and keys.
- [ ] Deploy preview and verify signed-in save/list/archive/delete/tags and external clients.
- [ ] Back up Railway SQLite, migrate production cache, switch domains and verify production.
- [ ] Stop Railway compute only after successful cutover; retain backups and volumes for rollback.

## Availability and constraints

Vercel Services and native Go runtime are currently beta on all plans. Native Go callers cannot consume service bindings; frontend Node functions can. The deployment topology must therefore route independently authenticated API prefixes directly to each Go service instead of requiring Go-to-Go bindings. Preview metadata must be accessible to OAuth authorization servers without Vercel authentication.

Turso Free currently includes 100 databases, 5 GB storage, 500 million monthly rows read, 10 million monthly rows written, and one day of point-in-time restore. Preview databases count toward these limits. Do not enable paid upgrades or add-ons.

MyContextProtocol returned HTTP 401 during discovery. Linear tools are not exposed in this session, so this file records progress pending issue access.

Sources: https://vercel.com/docs/services, https://vercel.com/docs/services/bindings, https://vercel.com/docs/functions/runtimes/go, https://vercel.com/docs/plans/hobby, https://turso.tech/pricing.
