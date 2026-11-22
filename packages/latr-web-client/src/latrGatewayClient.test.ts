import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { OAuthSession } from "@atproto/oauth-client-browser";
import {
  LATR_GATEWAY_MIGRATE_LEXICONS_PATH,
  LATR_UPSTREAM_DPOP_HEADER,
} from "latr-packages/gateway-client";

import { configureLatrGateway } from "./latrGatewayConfig";
import {
  LATR_PROXY_USER_AUTHORIZATION_HEADER,
  LATR_PROXY_USER_DPOP_HEADER,
  isLatrGatewayConflictError,
  latrGatewayFetch,
  latrGatewayJson,
  LatrGatewayError,
} from "./latrGatewayClient";
import { LATR_XRPC, latrXrpcPath } from "./xrpcMethods";

const ORIGINAL_FETCH = globalThis.fetch;

function resetGatewayConfig() {
  configureLatrGateway({
    appEnv: "local",
    gatewayUrl: "http://127.0.0.1:8080",
    testingHostname: "127.0.0.1",
    clientCredential: "",
    clientId: "",
    apiKey: "",
  });
}

beforeEach(() => {
  resetGatewayConfig();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  resetGatewayConfig();
  if (typeof window !== "undefined") {
    delete window.__LATR_GATEWAY_BOOTSTRAP__;
  }
});

function mockOAuthSession(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
  onJwtClaims?: (claims: Record<string, string | number>) => void
): OAuthSession {
  let proofCount = 0;

  return {
    did: "did:plc:viewer",
    fetchHandler: handler,
    getTokenInfo: async () => ({
      aud: "https://pds.example.test",
      iss: "https://bsky.social",
      sub: "did:plc:viewer",
      scope: "atproto",
    }),
    getTokenSet: async () => ({
      access_token: "test-access-token",
      token_type: "DPoP",
    }),
    server: {
      dpopNonces: {
        get: async () => "cached-nonce",
      },
      dpopKey: {
        bareJwk: { kty: "EC", crv: "P-256", x: "x", y: "y" },
        algorithms: ["ES256"],
        createJwt: async (_header: unknown, claims: Record<string, string | number>) => {
          proofCount += 1;
          onJwtClaims?.(claims);
          return `proof-${proofCount}`;
        },
      },
      serverMetadata: {
        dpop_signing_alg_values_supported: ["ES256"],
      },
    },
  } as unknown as OAuthSession;
}

describe("latrGatewayFetch upstream proofs", () => {
  test("latrGatewayJson exposes typed XRPC conflicts", async () => {
    globalThis.fetch = (async (_url, _init) =>
      new Response(JSON.stringify({ error: "Conflict", message: "Bookmark changed concurrently" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    const oauth = mockOAuthSession(async () =>
      new Response(null, {
        status: 400,
        headers: { "DPoP-Nonce": "fresh-pds-nonce" },
      })
    );

    let caught: unknown;
    try {
      await latrGatewayJson(oauth, latrXrpcPath(LATR_XRPC.deleteBookmarkTag), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: "Research", limit: 25 }),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LatrGatewayError);
    expect(caught).toMatchObject({
      status: 409,
      code: "Conflict",
      message: "Bookmark changed concurrently",
    });
    expect(isLatrGatewayConflictError(caught)).toBe(true);
    expect(isLatrGatewayConflictError(new Error("Conflict"))).toBe(false);
  });

  test("bookmark setState uses the published getRecord/applyWrites proof plan", async () => {
    let upstreamHeader = "";
    globalThis.fetch = (async (_url, init) => {
      upstreamHeader = new Headers(init?.headers).get(LATR_UPSTREAM_DPOP_HEADER) ?? "";
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const oauth = mockOAuthSession(async () =>
      new Response(null, {
        status: 400,
        headers: { "DPoP-Nonce": "fresh-pds-nonce" },
      })
    );

    await latrGatewayFetch(oauth, latrXrpcPath(LATR_XRPC.setBookmarkState), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookmarkUri: "at://did:plc:viewer/community.lexicon.bookmarks.bookmark/3abc",
        state: "archived",
      }),
    });

    expect(upstreamHeader.split(",")).toHaveLength(3);
  });

  test("tag methods use their published bounded proof plans", async () => {
    const proofCounts: number[] = [];
    globalThis.fetch = (async (_url, init) => {
      const header = new Headers(init?.headers).get(LATR_UPSTREAM_DPOP_HEADER) ?? "";
      proofCounts.push(header ? header.split(",").length : 0);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const oauth = mockOAuthSession(async () =>
      new Response(null, {
        status: 400,
        headers: { "DPoP-Nonce": "fresh-pds-nonce" },
      })
    );

    await latrGatewayFetch(oauth, latrXrpcPath(LATR_XRPC.listTags), { method: "GET" });
    await latrGatewayFetch(oauth, latrXrpcPath(LATR_XRPC.setBookmarkTags), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookmarkUri: "at://did:plc:viewer/community.lexicon.bookmarks.bookmark/3abc", tags: ["Research"] }),
    });
    await latrGatewayFetch(oauth, latrXrpcPath(LATR_XRPC.renameBookmarkTag), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "Research", replacement: "Reference", limit: 25 }),
    });
    await latrGatewayFetch(oauth, latrXrpcPath(LATR_XRPC.deleteBookmarkTag), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: "Reference", limit: 25 }),
    });

    expect(proofCounts).toEqual([1, 4, 2, 2]);
  });

  test("bookmark migration carries its published pool in the body", async () => {
    let upstreamHeader = "";
    let requestBody = "";
    globalThis.fetch = (async (_url, init) => {
      upstreamHeader = new Headers(init?.headers).get(LATR_UPSTREAM_DPOP_HEADER) ?? "";
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const oauth = mockOAuthSession(async () =>
      new Response(null, {
        status: 200,
        headers: { "DPoP-Nonce": "fresh-pds-nonce" },
      })
    );

    await latrGatewayFetch(oauth, latrXrpcPath(LATR_XRPC.migrateBookmarks), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 25, cursor: "retry-cursor" }),
    });

    const body = JSON.parse(requestBody) as {
      limit: number;
      cursor: string;
      upstreamDpopProof: string;
    };
    expect(upstreamHeader).toBe("");
    expect(body.limit).toBe(25);
    expect(body.cursor).toBe("retry-cursor");
    expect(body.upstreamDpopProof.split(",")).toHaveLength(90);
  });

  test("sends explicit gateway Authorization and DPoP headers", async () => {
    let authorization = "";
    let dpop = "";
    let upstreamDpop = "";
    const claimsSeen: Record<string, string | number>[] = [];

    globalThis.fetch = (async (_url, init) => {
      const headers = new Headers(init?.headers);
      authorization = headers.get("Authorization") ?? "";
      dpop = headers.get("DPoP") ?? "";
      upstreamDpop = headers.get(LATR_UPSTREAM_DPOP_HEADER) ?? "";
      return new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const oauth = mockOAuthSession(
      async () =>
        new Response(JSON.stringify({ error: "Use DPoP nonce" }), {
          status: 400,
          headers: { "DPoP-Nonce": "fresh-pds-nonce" },
        }),
      (claims) => claimsSeen.push(claims)
    );

    await latrGatewayFetch(oauth, "/xrpc/link.latr.preview.getOpenGraph?url=https://example.com", {
      method: "GET",
    });

    expect(authorization).toBe("DPoP test-access-token");
    expect(dpop).toBe("proof-1");
    expect(upstreamDpop).toBe("proof-2");
    expect(claimsSeen[0]).toMatchObject({
      htm: "GET",
      htu: "http://127.0.0.1:8080/xrpc/link.latr.preview.getOpenGraph",
    });
    expect(claimsSeen[1]).toMatchObject({
      htm: "GET",
      htu: "https://pds.example.test/xrpc/com.atproto.server.getSession",
      ath: expect.any(String),
      nonce: "fresh-pds-nonce",
    });
  });

  test("GET /xrpc/link.latr.discovery.resolveUrl sends a PDS session attestation proof", async () => {
    let upstreamDpop = "";
    const claimsSeen: Record<string, string | number>[] = [];

    globalThis.fetch = (async (_url, init) => {
      upstreamDpop =
        new Headers(init?.headers).get(LATR_UPSTREAM_DPOP_HEADER) ?? "";
      return new Response(JSON.stringify({ matches: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const oauth = mockOAuthSession(
      async () =>
        new Response(JSON.stringify({ error: "Use DPoP nonce" }), {
          status: 400,
          headers: { "DPoP-Nonce": "fresh-pds-nonce" },
        }),
      (claims) => claimsSeen.push(claims)
    );

    await latrGatewayFetch(
      oauth,
      "/xrpc/link.latr.discovery.resolveUrl?uri=at%3A%2F%2Fdid%3Aplc%3Atest%2Fapp.bsky.feed.post%2Fabc",
      { method: "GET" }
    );

    expect(upstreamDpop).toBe("proof-2");
    expect(claimsSeen[1]).toMatchObject({
      htm: "GET",
      htu: "https://pds.example.test/xrpc/com.atproto.server.getSession",
      ath: expect.any(String),
      nonce: "fresh-pds-nonce",
    });
  });

  test("uses proxy user auth headers for same-origin web gateway proxy", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
      location: {
        origin: "https://testing.latr.link",
      },
    } as Window & typeof globalThis;
    configureLatrGateway({
      appEnv: "dev",
      gatewayUrl: "https://testing.latr.link/api/latr-gateway",
      testingHostname: "testing.latr.link",
      clientCredential: "",
      clientId: "",
      apiKey: "",
    });

    let authorization = "";
    let dpop = "";
    let proxyAuthorization = "";
    let proxyDpop = "";

    globalThis.fetch = (async (_url, init) => {
      const headers = new Headers(init?.headers);
      authorization = headers.get("Authorization") ?? "";
      dpop = headers.get("DPoP") ?? "";
      proxyAuthorization =
        headers.get(LATR_PROXY_USER_AUTHORIZATION_HEADER) ?? "";
      proxyDpop = headers.get(LATR_PROXY_USER_DPOP_HEADER) ?? "";
      return new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const oauth = mockOAuthSession(async () => {
      return new Response(JSON.stringify({ error: "Use DPoP nonce" }), {
        status: 400,
        headers: { "DPoP-Nonce": "fresh-pds-nonce" },
      });
    });

    try {
      await latrGatewayFetch(oauth, "/xrpc/link.latr.bookmarks.listBookmarks", { method: "GET" });
    } finally {
      globalThis.window = previousWindow;
    }

    expect(authorization).toBe("");
    expect(dpop).toBe("");
    expect(proxyAuthorization).toBe("DPoP test-access-token");
    expect(proxyDpop).toBe("proof-1");
  });

  test("uses the credential-free Production proxy from an extension origin", async () => {
    const previousWindow = globalThis.window;
    globalThis.window = {
      location: { origin: "moz-extension://test-extension" },
    } as Window & typeof globalThis;
    configureLatrGateway({
      appEnv: "prod",
      gatewayUrl: "https://latr.link/api/latr-gateway",
      clientCredential: "",
      clientId: "",
      apiKey: "",
    });

    let requestUrl = "";
    let requestHeaders = new Headers();
    const claimsSeen: Record<string, string | number>[] = [];
    globalThis.fetch = (async (url, init) => {
      requestUrl = String(url);
      requestHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const oauth = mockOAuthSession(
      async () => new Response(null, { status: 200 }),
      (claims) => claimsSeen.push(claims)
    );

    try {
      await latrGatewayFetch(oauth, "/xrpc/link.latr.bookmarks.listBookmarks?limit=1", {
        method: "GET",
      });
    } finally {
      globalThis.window = previousWindow;
    }

    expect(requestUrl).toBe(
      "https://latr.link/api/latr-gateway/xrpc/link.latr.bookmarks.listBookmarks?limit=1"
    );
    expect(requestHeaders.get("Authorization")).toBeNull();
    expect(requestHeaders.get("DPoP")).toBeNull();
    expect(requestHeaders.get("X-Latr-Client-Id")).toBeNull();
    expect(requestHeaders.get("X-Latr-API-Key")).toBeNull();
    expect(requestHeaders.get(LATR_PROXY_USER_AUTHORIZATION_HEADER)).toBe(
      "DPoP test-access-token"
    );
    expect(requestHeaders.get(LATR_PROXY_USER_DPOP_HEADER)).toBe("proof-1");
    expect(claimsSeen[0]).toMatchObject({
      htm: "GET",
      htu: "https://latr.link/api/latr-gateway/xrpc/link.latr.bookmarks.listBookmarks",
    });
  });
  test("rejects retired REST and saved-item routes before minting proofs", async () => {
    const oauth = mockOAuthSession(async () => { throw new Error("must not contact PDS"); });
    for (const path of ["/v1/latr/saves", "/xrpc/link.latr.saved.listItems", "/xrpc/link.latr.developer.listClients"]) {
      await expect(latrGatewayFetch(oauth, path)).rejects.toThrow("Unsupported L@tr gateway endpoint");
    }
  });

});
