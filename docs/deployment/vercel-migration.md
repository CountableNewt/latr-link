# Go and Vercel migration

Status: production and branch previews run on Vercel; all eight Railway service instances are offline with no active deployments. Cutover completed on 2026-11-22 after signed-in acceptance, full required CI and public DNS/TLS verification.

## Decisions

- Replace the hosted Swift gateway with Go bookmark and metadata services, sharing auth and PDS packages.
- Keep native Swift apps and LatrKit as client libraries. Retire the public latrkit.dev console and developer client/key registration API. Official credentials remain internal server configuration.
- Use one Vercel Hobby project for L@tr.link, production from `main`, with branch-scoped preview deployments. No separate Dev project.
- Keep user bookmarks and metadata on the user's PDS. Use Turso Free for preview cache and atomic DPoP replay claims. Separate preview and production databases and credentials.
- Next.js 16 already uses Turbopack by default. Preserve static public pages and never cache authenticated responses across users.
- Non-commercial use confirmed by the owner on 2026-11-22.

## Work and acceptance

- [x] Port and test auth, PDS operations, bookmark/tag APIs and metadata behavior. Legacy `/v1/latr/*`, `link.latr.saved.*` and developer APIs are retired (410).
- [x] Remove public registration and retire developer console from deployment/build.
- [x] Make browser API calls deployment-local and verify OAuth metadata is publicly fetchable through a branch-domain protection exception. Other preview domains remain protected.
- [x] Configure Services routing, server-only credentials, production and branch preview isolation.
- [x] Run Go race/vet/build, JavaScript tests/lint/typecheck/build and Chrome public-page validation. Signed-in save/list/tags/archive/unarchive passed, including a successful tag edit after ten idle minutes; approved test-record removal passed and remained removed after reload.
- [x] Rehearse SQLite cache transfer (11 tests); copy and verify nine unexpired cache rows to separate Turso databases. No developer registry or third-party keys transferred. Five active hashes for the three existing first-party clients are retained only in internal secret configuration.
- [x] Deploy preview and verify signed-in save/list/archive/unarchive/delete/tags. Removal returned 200 through Next.js and Go and remained removed after reload. Native/extension OAuth metadata and contract checks passed; separate signed-in native/Social Wire sessions were not exercised.
- [x] Back up Railway SQLite, migrate production cache, switch domains and verify production.
- [x] Stop all eight Railway service instances after successful cutover and DNS cache drain; retain services, configuration, backups and volumes for rollback.

## Availability and constraints

Vercel Services and native Go runtime are currently beta on all plans. Native Go callers cannot consume service bindings; frontend Node functions can. The deployment topology must therefore route independently authenticated API prefixes directly to each Go service instead of requiring Go-to-Go bindings. Preview metadata must be accessible to OAuth authorization servers without Vercel authentication.

Turso Free currently includes 100 databases, 5 GB storage, 500 million monthly rows read, 10 million monthly rows written, and one day of point-in-time restore. Preview databases count toward these limits. Do not enable paid upgrades or add-ons.

MyContextProtocol returned HTTP 401 during discovery. Linear tools are not exposed in this session, so this file records progress pending issue access.

Sources: https://vercel.com/docs/services, https://vercel.com/docs/services/bindings, https://vercel.com/docs/functions/runtimes/go, https://vercel.com/docs/plans/hobby, https://turso.tech/pricing.

## Provisioned resources

- Vercel project: `latr-link` under `sam-clemente-s-team`; GitHub source `CountableNewt/latr-link`, production branch `main`. No separate Development project.
- Services: `web` (Next.js 16.4.5/Turbopack), `gateway` (Go), `metadata` (Go), all in `iad1`.
- Turso integration resources: `latr-link-preview` (Preview/Development only), `latr-link-production` (Production only), both $0 Starter. No paid plan or overages enabled.
- Branch alias: https://latr-link-git-feature-sqlite-gateway-sam-clemente-s-team.vercel.app . This alias alone has a deployment-protection exception so OAuth servers can fetch metadata. Application authentication still applies.
- Production SQLite backup: `/private/tmp/latr-cutover-20261122/production.sqlite`, directory mode 0700/file mode 0600; source quick-check passed. Durable production and development snapshots are retained under ignored `services/go-backend/data/retained-backups/2026-11-22/`, both integrity checks passed.

- Compatibility domains `testing.latr.link` and `api.testing.latr.link` are branch assignments within the same project; preview configuration retains eight existing own-client key hashes plus its internal web credential. Production retains five own-client hashes. No public registration database is deployed.
- `latrkit.dev` and `testing.latrkit.dev` redirect to `latr.link` (308). `www.latr.link` also redirects to the canonical apex. All seven app/API/testing/console domains are verified in Vercel with valid TLS.
- Railway Git sources for Web/Gateway/Console are disconnected in both environments. Existing deployments and volumes remained available through DNS/HTTPS acceptance and cache drain; retain all volumes after stopping compute.
- Future OAuth-enabled branches need a public branch/custom alias for authorization-server metadata fetches; do not disable protection project-wide. The stable migration alias exception does not expose arbitrary deployment URLs.

## Verification and fixes

- The proxy signs the original method/URL with `LATR_GATEWAY_PROXY_SECRET`; Go verifies the HMAC before using the public URL for DPoP binding. Vercel's internal hop rewrites ordinary forwarding headers, so accepting those headers alone broke hosted requests.
- Public pages and library shells prerender statically; authenticated API and OAuth metadata handlers remain dynamic/no-store. Browser bootstrap tests exclude server secrets and internal URLs.
- The small brand PNG is served directly in its three Next Image uses because the Services image-optimizer path returned 404. Other image settings remain unchanged.
- Schema-invalid community bookmark rows are skipped while retaining pagination cursors, matching the previous decoder. Malformed source records are never modified.
- Next.js was patched from 16.4.2 to 16.4.5 after verifying the November security advisory.
- A companion Social Wire cleanup is prepared at `/private/tmp/social-wire-latr-bookmarks`, branch `codex/latr-bookmark-client`, commit `c5a3b9f1` (96 focused tests/typecheck/lint). Active web/native bookmark flows were already canonical; this removes remaining old helper/backfill paths.

- Vercel ingress socket timeouts are disabled for the serverless runtime while application deadlines remain bounded. After ten idle minutes the hosted `setTags` request returned 200 through both Next.js and Go, with no retry. Standalone HTTP server timeouts remain configured.

## Cutover observations

- Testing web/API DNS changed to Vercel branch aliases. Both public OAuth metadata and TLS pass; Chrome desktop/mobile login/landing checks passed with loaded logos, no overflow and no console errors. Targeted protection exceptions cover the stable branch alias and the two testing aliases only.
- Production app/API/www and retired console TLS certificates were issued using Marque TXT validation before changing their live addresses. Existing MX, identity/lexicon TXT records, nameservers and DNSSEC were preserved.
- The production API TTL was reduced from 3600 to 60 seconds at approximately 19:17 UTC. Retain its old Railway gateway until at least 20:18 UTC to cover the earlier cache window. Testing web/API changed at approximately 19:13 UTC with prior TTL 3600; retain their old routes through 20:14 UTC.
- Native CI on `6c6411e` initially failed before invoking our extension: the simulator share-sheet remote container was empty in `testSafariShareRetainsSignedOutDraft` (`LaunchTests.swift:107`). Core tests (33), Release build, and the other seven iPhone UI tests passed. The identical native source passed that share test in the preceding run. The single retry failed earlier in the same Safari setup because a late first-use TipView blocked the toolbar. This is outside the app/extension flow. Test-only commit `e4ed814` handles late guidance, waits for actual share-sheet contents and scopes its activity picker. Its simulator test build passed for arm64/x86_64. Final CI on `5838acc` passed all 33 core tests, Release build, eight iPhone UI tests and eight iPad UI tests, including share draft on both devices. No app assertions were skipped. User-owned Apple edits remain uncommitted and excluded.

## Verified production release

- PR [#93](https://github.com/CountableNewt/latr-link/pull/93) merged as `93d859581c8d57a81b067877733b23183e3c0673`. Its Git tree exactly matches tested feature revision `5838acc` (`efb26665af26987744d396678ac57ad2fe8d10c3`). [All required checks passed](https://github.com/CountableNewt/latr-link/actions/runs/45063360410).
- Production-target deployment: `dpl_AswSMZC3J6bPDLpcEYtn12aRJ1JH`, built from merged `main`, with the production Turso resource. The earlier unaliased staging deployment is not the release.
- Final DPoP review removed every unsigned forwarded/original URL fallback. Only the actual request authority/path or a valid HMAC-attested proxy URL may match. Seven spoofed-header cases and full Go race/vet/build passed; signed-in hosted reads returned 200 through both layers on this strict build.
- All 25 public checks passed without deployment bypass: Vercel edge routing/TLS, logos, web/iOS/extension OAuth metadata, private/no-store API authentication, retired endpoints and canonical redirects.
- Chrome production landing/login passed at desktop and mobile sizes: loaded logos, no development ribbon, no overflow and no console errors. Signed-in preview save/list/tags/archive/unarchive/delete acceptance passed; the approved test bookmark remained removed after reload.
- Both existing Social Wire proxies (production and testing) reach Go and receive `AuthRequired`, confirming their internally configured keys are accepted. Separate signed-in Social Wire/native sessions were not exercised.
- Marque changes: apex A records `216.198.79.1`/`64.29.17.1` and app CNAMEs `75d0a22885ccc236.vercel-dns-017.com`. Existing mail/identity/lexicon records and DNSSEC were preserved. Managed certificates were issued with DNS validation before switching app addresses.

## Railway retirement

- After the DNS drain at 20:30 UTC, Web, Gateway, Developer Console and Postgres were stopped in both development and production with project/env/service-scoped `railway down`. No services, projects, volumes or backups were deleted. Both environments report all four services offline and `activeDeployments=[]`.
- Git sources remain disconnected for the three repo-backed services, preventing a later `main` push from restarting the retired infrastructure. Postgres image configuration remains retained.
- Retained SQLite volumes: development `df730399-2380-41f8-b13b-05216e0dcdd2`, production `34de7484-51eb-4d2c-93a7-a9b0731703ec`. Postgres volume association `7262938f-46b8-40dd-aaa1-fa1a725bb261` remains present in both environment readbacks. Durable production/development SQLite snapshots remain in the ignored backup directory, mode 0600, with successful integrity checks.
- All 25 public production/preview checks passed again after Railway shutdown, including readiness against Turso. Both app sites, APIs and retired-console redirects remain available. Temporary environment exports were removed after migration; no credentials are committed.
- User-owned Apple changes, including the pre-existing staged `SaveAndTagsViews.swift` blob, were preserved. Only the independently compiled share-test harness fix was included in the release.
