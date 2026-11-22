# XRPC contract ownership

The hosted gateway is Go (`services/go-backend`). Swift is reserved for the
Apple app and its remote native client dependencies. The former Swift gateway
and public developer-management APIs are retired; historical rollout plans are
available in Git history at `009e734`.

## Canonical packages

- `latr-packages` owns lexicons, TypeScript gateway contracts, deterministic
  record keys and golden fixtures. Update the root remote dependency when
  adopting contract changes; do not duplicate lexicon JSON in this checkout.
- `latr-kit` owns the remote Swift client library. Pin native client updates in
  `apps/apple/Package.swift` and the Apple project's package references.
- Go validates generated contracts from the pinned `latr-packages` revision.
  Run `python3 scripts/generate-go-contracts.py --check` to verify parity.

## Validation

Run `bash scripts/ci.sh` for Go and browser clients and the native CI checks for
Apple changes. Verify canonical bookmark XRPC calls, pagination, PDS records,
upstream proof consumption and deterministic record-key parity. Developer key
issuance and legacy saved-record routes are retired and must remain unavailable.

See [gateway contracts](latr-gateway.md) and
[deployment guidance](../deployment/vercel-migration.md).
