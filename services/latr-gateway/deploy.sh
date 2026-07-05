#!/usr/bin/env bash
# Deploy latr-gateway from services/latr-gateway (LatrKit resolves from GitHub via SwiftPM).
#
# Usage: bash deploy.sh dev|main
set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "$0")" && pwd)"
BRANCH="${1:?usage: deploy.sh dev|main}"
shift

if [ "$BRANCH" = "main" ]; then
  CONFIG="fly.prod.toml"
  APP="${FLY_GATEWAY_APP_PROD:-latr-link-prod-gateway}"
else
  CONFIG="fly.toml"
  APP="${FLY_GATEWAY_APP_DEV:-latr-link-dev-gateway}"
fi

bash "$SERVICE_DIR/prepare-docker.sh"
cd "$SERVICE_DIR"
echo "Deploying $APP with $CONFIG"

if command -v flyctl >/dev/null 2>&1; then
  exec flyctl deploy --config "$CONFIG" --app "$APP" --remote-only "$@"
fi
if command -v fly >/dev/null 2>&1; then
  exec fly deploy --config "$CONFIG" --app "$APP" --remote-only "$@"
fi
echo "Install flyctl to deploy: https://fly.io/docs/flyctl/install/" >&2
exit 1
