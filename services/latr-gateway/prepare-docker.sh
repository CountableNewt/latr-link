#!/usr/bin/env bash
# Stage packages/latr-kit into vendor/ for gateway-local Docker/Fly builds.
set -euo pipefail

SERVICE_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SERVICE_DIR/../.." && pwd)"
VENDOR="$SERVICE_DIR/vendor/latr-kit"

mkdir -p "$SERVICE_DIR/vendor"
rsync -a --delete \
  --exclude '.build/' \
  --exclude '.swiftpm/' \
  --exclude 'Package.resolved' \
  "$ROOT/packages/latr-kit/" "$VENDOR/"

echo "Staged LatrKit for Docker build at $VENDOR"
