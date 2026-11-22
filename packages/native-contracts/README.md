# Native contract fixtures

`contracts.v1.json` is generated from the root pinned `latr-packages` dependency and the web OAuth metadata. It contains native environment configuration and exact gateway/PDS proof plans. It is test data, not a new Lexicon source or independently versioned API.

Run `bun scripts/native-contracts.ts` after intentionally updating upstream contracts or scopes; `bun scripts/native-contracts.ts --check` rejects drift. The Apple core tests consume these fixtures independently to detect drift from the TypeScript client. The fixture also retains Android OAuth declarations, but this checkout has no Android application target. The deployed PATCH adapter for bookmark state is explicitly tracked as LTR-19.

`behavior.v1.json` covers subject preservation, exact case-sensitive tags, Unicode, and current bookmark response decoding. Tag graphemes and UTF-8 byte limits both apply. Do not Unicode-normalize tags or canonicalize saved subjects.

OAuth metadata is a public client declaration: it contains no API key or signing key. Development metadata must be fetched from testing.latr.link (a selected Vercel branch preview); Production metadata must be fetched from latr.link. Files served from an alternate origin do not represent that origin as a client ID.
