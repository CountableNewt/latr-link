import type { OAuthSession } from "@atproto/oauth-client-browser";
import {
  bookmarkUpstreamProofPlanForGatewayRequest,
  createBookmarkMigrationRequestBody,
  createUpstreamDpopProof,
  LATR_UPSTREAM_DPOP_HEADER,
} from "latr-packages/gateway-client";

import { createChainedUpstreamDpopProofPool } from "./upstreamDpopPool";

import {
  assertLatrGatewayClientCredential,
  latrGatewayBaseUrl,
  latrGatewayClientHeaders,
  LATR_OFFICIAL_CLIENT_HEADER,
  isTrustedLatrGatewayProxyUrl,
  resolveLatrGatewayConfig,
} from "latr-web-client/latrGatewayConfig";
import { LATR_XRPC, latrXrpcPath } from "./xrpcMethods";

export { LATR_OFFICIAL_CLIENT_HEADER, LATR_UPSTREAM_DPOP_HEADER };

export const LATR_PROXY_USER_AUTHORIZATION_HEADER = "X-Latr-User-Authorization";
export const LATR_PROXY_USER_DPOP_HEADER = "X-Latr-User-DPoP";

export type LatrGatewayFetchOptions = {
  /** Developer console management routes use OAuth only (no app API key). */
  skipClientCredential?: boolean;
};

type TokenSet = {
  access_token: string;
  token_type?: string;
};

type SessionWithTokenSet = OAuthSession & {
  getTokenSet(refresh: boolean | "auto"): Promise<TokenSet>;
};

const PDS_SESSION_ATTESTATION_PATHS = new Set([
  latrXrpcPath(LATR_XRPC.resolveUrl),
  latrXrpcPath(LATR_XRPC.getOpenGraph),
]);

function stripQueryAndFragment(url: string): string {
  const fragmentIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");
  if (fragmentIndex === -1 && queryIndex === -1) return url;
  if (fragmentIndex === -1) return url.slice(0, queryIndex);
  if (queryIndex === -1) return url.slice(0, fragmentIndex);
  return url.slice(0, Math.min(fragmentIndex, queryIndex));
}

async function sha256Base64Url(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const view = new Uint8Array(digest);
  let binary = "";
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function buildGatewayUserAuthHeaders(
  oauthSession: OAuthSession,
  method: string,
  gatewayUrl: string,
  tokenSet: TokenSet
): Promise<Record<string, string>> {
  const key = oauthSession.server.dpopKey;
  const jwk = key.bareJwk;
  if (!jwk) {
    throw new Error("OAuth session DPoP key is unavailable");
  }

  const supported =
    oauthSession.server.serverMetadata.dpop_signing_alg_values_supported;
  const alg =
    supported?.find((candidate) => key.algorithms.includes(candidate)) ??
    key.algorithms[0];
  if (!alg) {
    throw new Error("OAuth session DPoP key has no supported algorithm");
  }

  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, string | number> = {
    iat: now,
    jti: Math.random().toString(36).slice(2),
    htm: method.toUpperCase(),
    htu: stripQueryAndFragment(gatewayUrl),
    ath: await sha256Base64Url(tokenSet.access_token),
  };
  const dpop = await key.createJwt({ alg, typ: "dpop+jwt", jwk }, claims);

  return {
    Authorization: `${tokenSet.token_type ?? "DPoP"} ${tokenSet.access_token}`,
    DPoP: dpop,
  };
}

function headersForGatewayHop(
  url: string,
  userAuthHeaders: Record<string, string>
): Record<string, string> {
  const baseUrl = new URL(url);
  if (!baseUrl.pathname.startsWith("/api/latr-gateway/")) {
    return userAuthHeaders;
  }
  baseUrl.pathname = "/api/latr-gateway";
  baseUrl.search = "";
  baseUrl.hash = "";
  if (!isTrustedLatrGatewayProxyUrl(baseUrl.href)) return userAuthHeaders;

  return {
    [LATR_PROXY_USER_AUTHORIZATION_HEADER]: userAuthHeaders.Authorization,
    [LATR_PROXY_USER_DPOP_HEADER]: userAuthHeaders.DPoP,
  };
}

export async function latrGatewayFetch(
  oauthSession: OAuthSession,
  path: string,
  init?: RequestInit,
  options?: LatrGatewayFetchOptions
): Promise<Response> {
  const gatewayPath = path.startsWith("/") ? path : `/${path}`;
  const pathOnly = stripQueryAndFragment(gatewayPath);
  const supportedPaths = new Set([
    ...[LATR_XRPC.listBookmarks, LATR_XRPC.listTags, LATR_XRPC.getBookmark,
      LATR_XRPC.saveBookmark, LATR_XRPC.setBookmarkTags, LATR_XRPC.renameBookmarkTag,
      LATR_XRPC.deleteBookmarkTag, LATR_XRPC.syncBookmarkMetadata, LATR_XRPC.setBookmarkState,
      LATR_XRPC.deleteBookmark, LATR_XRPC.migrateBookmarks, LATR_XRPC.getOpenGraph,
      LATR_XRPC.resolveUrl, LATR_XRPC.authProbe].map(latrXrpcPath),
  ]);
  if (!supportedPaths.has(pathOnly)) {
    throw new Error("Unsupported L@tr gateway endpoint; use the bookmarks XRPC API");
  }
  const config = resolveLatrGatewayConfig();
  if (!options?.skipClientCredential) {
    assertLatrGatewayClientCredential(config);
  }
  const url = `${latrGatewayBaseUrl(config)}${gatewayPath}`;
  const method = init?.method ?? "GET";
  const clientHeaders = latrGatewayClientHeaders(config);

  const gatewayPathOnly = stripQueryAndFragment(gatewayPath);
  const bookmarkProofPlan = bookmarkUpstreamProofPlanForGatewayRequest(
    method,
    gatewayPathOnly
  );
  const upstreamHeaders: Record<string, string> = {};
  let requestBody = init?.body;
  const sessionWithTokenSet = oauthSession as SessionWithTokenSet;
  const tokenSet = await sessionWithTokenSet.getTokenSet("auto");
  const proofOptions = { accessToken: tokenSet.access_token };
  const userAuthHeaders = await buildGatewayUserAuthHeaders(
    oauthSession,
    method,
    url,
    tokenSet
  );
  const hopUserAuthHeaders = headersForGatewayHop(url, userAuthHeaders);

  if (bookmarkProofPlan?.transport === "body") {
    const parsed = typeof requestBody === "string"
      ? JSON.parse(requestBody) as Record<string, unknown>
      : {};
    requestBody = await createBookmarkMigrationRequestBody(
      oauthSession,
      parsed,
      proofOptions
    );
    upstreamHeaders["Content-Type"] = "application/json";
  } else if (bookmarkProofPlan?.transport === "header") {
    upstreamHeaders[LATR_UPSTREAM_DPOP_HEADER] =
      await createChainedUpstreamDpopProofPool(
        oauthSession,
        [...bookmarkProofPlan.specs],
        proofOptions
      );
  } else if (
    method === "GET" &&
    PDS_SESSION_ATTESTATION_PATHS.has(gatewayPathOnly)
  ) {
    upstreamHeaders[LATR_UPSTREAM_DPOP_HEADER] =
      await createUpstreamDpopProof(
        oauthSession,
        "com.atproto.server.getSession",
        "GET",
        proofOptions
      );
  } else if (method === "GET" && gatewayPathOnly === latrXrpcPath(LATR_XRPC.authProbe)) {
    upstreamHeaders[LATR_UPSTREAM_DPOP_HEADER] = await createUpstreamDpopProof(
      oauthSession, "com.atproto.server.getSession", "GET", proofOptions
    );
  }

  return fetch(url, {
    ...init,
    body: requestBody,
    headers: {
      Accept: "application/json",
      ...clientHeaders,
      ...hopUserAuthHeaders,
      ...upstreamHeaders,
      ...(init?.headers ?? {}),
    },
  });
}

type LatrGatewayErrorBody = {
  error?: string;
  message?: string;
};

export class LatrGatewayError extends Error {
  readonly name = "LatrGatewayError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function isLatrGatewayConflictError(error: unknown): error is LatrGatewayError {
  return error instanceof LatrGatewayError && error.status === 409 && error.code === "Conflict";
}

async function readGatewayError(res: Response): Promise<LatrGatewayError> {
  try {
    const body = (await res.json()) as LatrGatewayErrorBody;
    return new LatrGatewayError(
      res.status,
      body.error ?? "GatewayError",
      body.message ?? body.error ?? `Gateway error (${res.status})`
    );
  } catch {
    return new LatrGatewayError(res.status, "GatewayError", `Gateway error (${res.status})`);
  }
}

export async function latrGatewayJson<T>(
  oauthSession: OAuthSession,
  path: string,
  init?: RequestInit,
  options?: LatrGatewayFetchOptions
): Promise<T> {
  const res = await latrGatewayFetch(oauthSession, path, init, options);
  if (!res.ok) {
    throw await readGatewayError(res);
  }
  return (await res.json()) as T;
}
