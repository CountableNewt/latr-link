import type { OAuthSession } from "@atproto/oauth-client-browser";

import { latrGatewayBaseUrl } from "@/lib/latrGatewayUrl";

/** Matches gateway `X-ATProto-Upstream-DPoP` for PDS-bound write-through proofs. */
export const LATR_UPSTREAM_DPOP_HEADER = "X-ATProto-Upstream-DPoP";

/** Matches gateway client API key headers for registered first-party apps. */
export const LATR_CLIENT_ID_HEADER = "X-Latr-Client-Id";
export const LATR_API_KEY_HEADER = "X-Latr-API-Key";

export { latrGatewayBaseUrl } from "@/lib/latrGatewayUrl";

export async function latrGatewayFetch(
  oauthSession: OAuthSession,
  path: string,
  init?: RequestInit
): Promise<Response> {
  const url = `${latrGatewayBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const clientId = process.env.NEXT_PUBLIC_LATR_GATEWAY_CLIENT_ID?.trim();
  const apiKey = process.env.NEXT_PUBLIC_LATR_GATEWAY_API_KEY?.trim();
  const clientHeaders: Record<string, string> = {};
  if (clientId && apiKey) {
    clientHeaders[LATR_CLIENT_ID_HEADER] = clientId;
    clientHeaders[LATR_API_KEY_HEADER] = apiKey;
  }

  return oauthSession.fetchHandler(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...clientHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

async function readGatewayError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? `Gateway error (${res.status})`;
  } catch {
    return `Gateway error (${res.status})`;
  }
}

export async function latrGatewayJson<T>(
  oauthSession: OAuthSession,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await latrGatewayFetch(oauthSession, path, init);
  if (!res.ok) {
    throw new Error(await readGatewayError(res));
  }
  return (await res.json()) as T;
}
