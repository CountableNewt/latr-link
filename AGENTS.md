## Workspace facts

- Monorepo root: Bun workspaces (`apps/*`, `packages/*`) + Turborepo.
- Web app: `apps/web` (package name `web`). Run checks with `bun run turbo run build --filter=web...` or `cd apps/web && bun run …`.
- Shared logic: `packages/latr-kit` (import as `latr-kit` in `apps/web`).

## Conventions

- ATProto OAuth scopes must match `apps/web/public/client-metadata.json` — users must re-auth after scope changes.
- Local dev: loopback OAuth activates on **localhost / 127.0.0.1** without requiring `NODE_ENV=development` (works with `next start` too). Optional `NEXT_PUBLIC_APP_ENV=local` in `apps/web/.env.local`. Timeouts: `NEXT_PUBLIC_OAUTH_CLIENT_LOAD_TIMEOUT_MS`, `NEXT_PUBLIC_AUTH_RESTORE_TIMEOUT_MS` — see `apps/web/.env.example`. Auth UI also forces loading off after 4s (`useAuth` failsafe). Use `http://127.0.0.1:3000` when testing OAuth.
