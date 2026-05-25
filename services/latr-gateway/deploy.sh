#!/usr/bin/env bash
# Deploy latr-gateway from monorepo root (Docker build context = repo root).
#
# Usage: bash deploy.sh dev|main
set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SERVICE_DIR/../.." && pwd)"
BRANCH="${1:?usage: deploy.sh dev|main}"

if [ "$BRANCH" = "main" ]; then
  APP="${FLY_GATEWAY_APP_PROD:-latr-link-prod-gateway}"
else
  APP="${FLY_GATEWAY_APP_DEV:-latr-link-dev-gateway}"
fi

CONFIG="services/latr-gateway/fly.toml"

cd "$ROOT"

if command -v flyctl >/dev/null 2>&1; then
  exec flyctl deploy . --config "$CONFIG" --app "$APP" --remote-only "$@"
fi
if command -v fly >/dev/null 2>&1; then
  exec fly deploy . --config "$CONFIG" --app "$APP" --remote-only "$@"
fi
echo "Install flyctl to deploy: https://fly.io/docs/flyctl/install/" >&2
exit 1
