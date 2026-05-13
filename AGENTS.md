## Workspace facts

- Monorepo root: Bun workspaces (`apps/*`, `packages/*`) + Turborepo.
- Web app: `apps/web` (package name `web`). Run checks with `bun run turbo run build --filter=web...` or `cd apps/web && bun run …`.
- Shared logic: `packages/latr-kit` (import as `latr-kit` in `apps/web`).

## Conventions

- ATProto OAuth scopes must match `apps/web/public/client-metadata.json` — users must re-auth after scope changes.
- Local dev: `NEXT_PUBLIC_APP_ENV=local` in `apps/web/.env.local` — builds a proper loopback `client_id` (redirect `/callback` + repo scopes). Optional: `NEXT_PUBLIC_LOCAL_REDIRECT_URI`, `NEXT_PUBLIC_LOCAL_OAUTH_CLIENT_ID`. Use `http://127.0.0.1:3000` when testing OAuth.
