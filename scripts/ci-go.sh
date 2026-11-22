#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
python3 scripts/generate-go-contracts.py --check
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts -p test_turso_migration.py
cd services/go-backend
test -z "$(gofmt -l .)"
go test -race ./...
go vet ./...
go build ./...
