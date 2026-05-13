/**
 * ATProto OAuth — PKCE + DPoP via @atproto/oauth-client-browser.
 */
import { BrowserOAuthClient, OAuthSession } from "@atproto/oauth-client-browser";
import { BSKY_APPVIEW_PUBLIC } from "@/lib/appview";

export const AT_PROTO_OAUTH_SCOPES = [
  "atproto",
  "repo:com.latr.saved.external?action=create&action=update&action=delete",
  "repo:com.latr.saved.item?action=create&action=update&action=delete",
].join(" ");

function resolveClientId(): string {
  if (process.env.NEXT_PUBLIC_APP_ENV === "local") {
    return "http://localhost";
  }
  return (
    process.env.NEXT_PUBLIC_ATPROTO_CLIENT_ID ??
    "https://latr.link/client-metadata.json"
  );
}

let _clientPromise: Promise<BrowserOAuthClient> | null = null;

export async function getOAuthClient(): Promise<BrowserOAuthClient> {
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
