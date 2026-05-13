## Workspace facts

- Monorepo root: Bun workspaces (`apps/*`, `packages/*`) + Turborepo.
- Web app: `apps/web` (package name `web`). Run checks with `bun run turbo run build --filter=web...` or `cd apps/web && bun run …`.
- Shared logic: `packages/latr-kit` (import as `latr-kit` in `apps/web`).

## Conventions

- ATProto OAuth scopes must match `apps/web/public/client-metadata.json` — users must re-auth after scope changes.
- Local dev: set `NEXT_PUBLIC_APP_ENV=local` so OAuth client id is `http://localhost` (ATProto loopback rule).
