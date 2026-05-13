/**
 * ATProto OAuth — PKCE + DPoP via @atproto/oauth-client-browser.
 *
 * Local dev: the loopback `client_id` must embed `redirect_uri` (and non-default
 * `scope`) — see @atproto/oauth-client-browser README “Using in development”.
 * Bare `http://localhost` defaults to redirect URIs on `/`, not `/callback`.
 */
import { BrowserOAuthClient, OAuthSession } from "@atproto/oauth-client-browser";
import { buildAtprotoLoopbackClientId } from "@atproto/oauth-types";

import { BSKY_APPVIEW_PUBLIC } from "@/lib/appview";

export const AT_PROTO_OAUTH_SCOPES = [
  "atproto",
  "repo:com.latr.saved.external?action=create&action=update&action=delete",
  "repo:com.latr.saved.item?action=create&action=update&action=delete",
].join(" ");

export function isLocalOAuthMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_APP_ENV === "local" ||
    process.env.NEXT_PUBLIC_ATPROTO_LOCAL === "true"
  );
}

/**
 * Full loopback `client_id` URL (`http://localhost?...`) or hosted metadata URL.
 * Only safe to call in the browser (uses `window.location` for default redirect).
 */
export function resolveClientId(): string {
  const manual = process.env.NEXT_PUBLIC_LOCAL_OAUTH_CLIENT_ID?.trim();
  if (manual) {
    return manual;
  }

  if (!isLocalOAuthMode()) {
    return (
      process.env.NEXT_PUBLIC_ATPROTO_CLIENT_ID ??
      "https://latr.link/client-metadata.json"
    );
  }

  if (typeof window === "undefined") {
    throw new Error(
      "resolveClientId: local OAuth requires the browser (window is undefined). Call from client code only."
    );
  }

  const explicitRedirect = process.env.NEXT_PUBLIC_LOCAL_REDIRECT_URI?.trim();
  const redirectUri = explicitRedirect ?? buildDefaultLocalCallbackUrl();

  return buildAtprotoLoopbackClientId({
    scope: AT_PROTO_OAUTH_SCOPES,
    redirect_uris: [redirectUri],
  });
}

/** `http://127.0.0.1:<port>/callback` matching this tab (maps localhost → 127.0.0.1). */
function buildDefaultLocalCallbackUrl(): string {
  const u = new URL(window.location.href);
  if (u.hostname === "localhost") {
    u.hostname = "127.0.0.1";
  }
  u.pathname = "/callback";
  u.search = "";
  u.hash = "";
  return u.toString();
}

let _clientPromise: Promise<BrowserOAuthClient> | null = null;

export async function getOAuthClient(): Promise<BrowserOAuthClient> {
  if (typeof window === "undefined") {
    throw new Error("getOAuthClient is browser-only");
  }
  if (!_clientPromise) {
    _clientPromise = BrowserOAuthClient.load({
      clientId: resolveClientId(),
      handleResolver: BSKY_APPVIEW_PUBLIC,
    });
  }
  return _clientPromise;
}

export async function signIn(handle: string): Promise<void> {
  const client = await getOAuthClient();
  await client.signInRedirect(handle, {
    scope: AT_PROTO_OAUTH_SCOPES,
  });
}

export async function handleCallback(): Promise<OAuthSession> {
  const client = await getOAuthClient();
  const { session } = await client.initCallback(client.readCallbackParams());
  return session;
}

export async function getSession(): Promise<OAuthSession | null> {
  const client = await getOAuthClient();
  try {
    const result = await client.init();
    if (!result) return null;
    return result.session ?? null;
  } catch {
    return null;
  }
}

export async function signOut(did: string): Promise<void> {
  const client = await getOAuthClient();
  await client.revoke(did);
}

export function createAuthFetch(
  session: OAuthSession
): (url: string, init?: RequestInit) => Promise<Response> {
  return (url, init) => session.fetchHandler(url, init);
}
