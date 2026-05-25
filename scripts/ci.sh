#!/usr/bin/env bash
# Shared CI entrypoint (GitHub Actions: .github/workflows/ci.yml).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bun install --frozen-lockfile
swift test --package-path packages/latr-kit
swift build -c release --package-path packages/latr-kit
swift test --package-path services/latr-gateway
swift build -c release --package-path services/latr-gateway
bun run turbo run typecheck lint test build --filter=web...
bun --cwd packages/lexicons test
