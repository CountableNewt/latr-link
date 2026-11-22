# Go and Vercel migration

Status as of 2026-11-22 19:47 UTC: testing web/API are on Vercel; production remains on Railway pending native CI setup fixes.

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
- [ ] Back up Railway SQLite, migrate production cache, switch domains and verify production.
- [ ] Stop Railway compute only after successful cutover; retain backups and volumes for rollback.

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
- `latrkit.dev` and `testing.latrkit.dev` are configured as redirects to `latr.link`; external DNS changes remain pending.
- Railway Git sources for Web/Gateway/Console are disconnected in both environments. Existing deployments and volumes remain running until DNS/HTTPS acceptance.
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
- Native CI on `6c6411e` initially failed before invoking our extension: the simulator share-sheet remote container was empty in `testSafariShareRetainsSignedOutDraft` (`LaunchTests.swift:107`). Core tests (33), Release build, and the other seven iPhone UI tests passed. The identical native source passed that share test in the preceding run. The single retry failed earlier in the same Safari setup because a late first-use TipView blocked the toolbar. This is outside the app/extension flow. Test-only commit `e4ed814` handles late guidance, waits for actual share-sheet contents and scopes its activity picker. Its simulator test build passed for arm64/x86_64; full runtime CI remains the release gate. Production remains held. User-owned Apple edits remain uncommitted and excluded.
