import { afterEach, describe, expect, test } from "bun:test";

import { GET, POST } from "./route";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = {
  APP_ENV: process.env.APP_ENV,
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_LATR_GATEWAY_URL: process.env.NEXT_PUBLIC_LATR_GATEWAY_URL,
  LATR_GATEWAY_CLIENT_ID: process.env.LATR_GATEWAY_CLIENT_ID,
  LATR_GATEWAY_API_KEY: process.env.LATR_GATEWAY_API_KEY,
  LATR_GATEWAY_CLIENT_CREDENTIAL: process.env.LATR_GATEWAY_CLIENT_CREDENTIAL,
};

function restoreEnv(): void {
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restoreEnv();
});

describe("/api/latr-gateway proxy", () => {
  test("Injects Server Split Credentials And Preserves Browser DPoP Headers", async () => {
    process.env.LATR_GATEWAY_CLIENT_ID = "latr-link-web";
    process.env.LATR_GATEWAY_API_KEY = "lk_server";
    process.env.NEXT_PUBLIC_LATR_GATEWAY_URL = "https://api.testing.latr.link";

    let target = "";
    let headers = new Headers();
    globalThis.fetch = (async (url, init) => {
      target = String(url);
      headers = new Headers(init?.headers);
      return new Response(JSON.stringify({ records: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const req = new Request(
      "https://testing.latr.link/api/latr-gateway/v1/latr/saves?limit=10",
      {
        headers: {
          Accept: "application/json",
          Authorization: "DPoP access",
          DPoP: "gateway-proof",
          "X-ATProto-Upstream-DPoP": "upstream-proof",
          "X-Latr-Client-Id": "browser-client",
          "X-Latr-API-Key": "lk_browser",
          "X-Forwarded-Host": "testing.latr.link",
          "X-Forwarded-Proto": "https",
        },
      }
    );

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(target).toBe("https://api.testing.latr.link/v1/latr/saves?limit=10");
    expect(headers.get("Authorization")).toBe("DPoP access");
    expect(headers.get("DPoP")).toBe("gateway-proof");
    expect(headers.get("X-ATProto-Upstream-DPoP")).toBe("upstream-proof");
    expect(headers.get("X-Latr-Client-Id")).toBe("latr-link-web");
    expect(headers.get("X-Latr-API-Key")).toBe("lk_server");
    expect(headers.get("X-Original-URI")).toBe(
      "/api/latr-gateway/v1/latr/saves?limit=10"
    );
  });

  test("Forwards Request Bodies", async () => {
    process.env.LATR_GATEWAY_CLIENT_CREDENTIAL = "legacy-server-credential";
    process.env.NEXT_PUBLIC_LATR_GATEWAY_URL = "https://api.testing.latr.link";

    let body = "";
    let headers = new Headers();
    globalThis.fetch = (async (_url, init) => {
      headers = new Headers(init?.headers);
      body = await new Response(init?.body).text();
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const req = new Request(
      "https://testing.latr.link/api/latr-gateway/v1/latr/saves",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-Host": "testing.latr.link",
          "X-Forwarded-Proto": "https",
        },
        body: JSON.stringify({ kind: "url", url: "https://example.com" }),
      }
    );

    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(headers.get("X-Latr-Official-Client")).toBe("legacy-server-credential");
    expect(body).toBe(JSON.stringify({ kind: "url", url: "https://example.com" }));
  });
});
