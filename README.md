# L@tr (latr.link)

Read-later on your own ATProto repo. Saved state lives in `com.latr.saved.item` and `com.latr.saved.external` — no Stygian backend required for core functionality.

```
Next.js (latr.link)  ── ATProto OAuth ──►  Your PDS
                         XRPC            com.latr.saved.item
                                         com.latr.saved.external
```

## Monorepo layout

```
latr-link/
  apps/
    web/           # Next.js web client (Bun)
  packages/
    lexicons/    # com.latr.* lexicon JSON
    latr-kit/    # URL normalization, rkey helpers, shared types
  docs/
    architecture/
```

## Prerequisites

| Tool | Version |
|------|---------|
| [Bun](https://bun.sh) | ≥ 1.2 |

## Quick start

```bash
bun install
cd apps/web
cp .env.example .env.local
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Commands (repo root)

| Script | Description |
|--------|-------------|
| `bun run dev` | Turbo dev (web app) |
| `bun run build` | Production build |
| `bun run lint` | ESLint |
| `bun run typecheck` | TypeScript |
| `bun run test` | Unit tests (workspace) |

## Architecture

See [docs/architecture/overview.md](docs/architecture/overview.md).

## Lexicons

See [packages/lexicons/README.md](packages/lexicons/README.md).
