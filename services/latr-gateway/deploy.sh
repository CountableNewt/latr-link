#!/usr/bin/env bash
# Deploy latr-gateway from services/latr-gateway (LatrKit resolves from GitHub via SwiftPM).
#
# Usage: bash deploy.sh dev|main
set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "$0")" && pwd)"
BRANCH="${1:?usage: deploy.sh dev|main}"
shift

if [ "$BRANCH" = "main" ]; then
  APP="${FLY_GATEWAY_APP_PROD:-latr-link-prod-gateway}"
  APP_ENV_VALUE="prod"
  OAUTH_PUBLIC_ORIGIN_VALUE="${OAUTH_PUBLIC_ORIGIN_PROD:-https://latr.link}"
  OAUTH_LATRKIT_PUBLIC_ORIGIN_VALUE="${OAUTH_LATRKIT_PUBLIC_ORIGIN_PROD:-https://latrkit.dev}"
else
  APP="${FLY_GATEWAY_APP_DEV:-latr-link-dev-gateway}"
  APP_ENV_VALUE="dev"
  OAUTH_PUBLIC_ORIGIN_VALUE="${OAUTH_PUBLIC_ORIGIN_DEV:-https://testing.latr.link}"
  OAUTH_LATRKIT_PUBLIC_ORIGIN_VALUE="${OAUTH_LATRKIT_PUBLIC_ORIGIN_DEV:-https://testing.latrkit.dev}"
fi

bash "$SERVICE_DIR/prepare-docker.sh"
cd "$SERVICE_DIR"
echo "Deploying $APP with fly.toml (APP_ENV=$APP_ENV_VALUE)"

if command -v flyctl >/dev/null 2>&1; then
  exec flyctl deploy \
    --config fly.toml \
    --app "$APP" \
    --remote-only \
    --env "APP_ENV=$APP_ENV_VALUE" \
    --env "OAUTH_PUBLIC_ORIGIN=$OAUTH_PUBLIC_ORIGIN_VALUE" \
    --env "OAUTH_LATRKIT_PUBLIC_ORIGIN=$OAUTH_LATRKIT_PUBLIC_ORIGIN_VALUE" \
    "$@"
fi
if command -v fly >/dev/null 2>&1; then
  exec fly deploy \
    --config fly.toml \
    --app "$APP" \
    --remote-only \
    --env "APP_ENV=$APP_ENV_VALUE" \
    --env "OAUTH_PUBLIC_ORIGIN=$OAUTH_PUBLIC_ORIGIN_VALUE" \
    --env "OAUTH_LATRKIT_PUBLIC_ORIGIN=$OAUTH_LATRKIT_PUBLIC_ORIGIN_VALUE" \
    "$@"
fi
echo "Install flyctl to deploy: https://fly.io/docs/flyctl/install/" >&2
exit 1
