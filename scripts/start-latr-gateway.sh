#!/usr/bin/env bash
# Railway mounts volumes after image build; initialize ownership at runtime.
set -euo pipefail
umask 077

if [[ "${LATR_GATEWAY_DATABASE_BACKEND:-sqlite}" == sqlite ]]; then
  database_path="${LATR_GATEWAY_SQLITE_PATH:?LATR_GATEWAY_SQLITE_PATH is required in the container}"
  database_directory="$(dirname "$database_path")"
  mkdir -p "$database_directory"
  if [[ "$(id -u)" == 0 ]]; then
    chown nobody:nogroup "$database_directory"
    for file in "$database_path" "$database_path-wal" "$database_path-shm"; do
      if [[ -e "$file" ]]; then chown nobody:nogroup "$file"; fi
    done
  fi
fi

if [[ "$(id -u)" == 0 ]]; then
  exec gosu nobody:nogroup /usr/local/bin/latr-gateway "$@"
fi
exec /usr/local/bin/latr-gateway "$@"
