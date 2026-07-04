import {
  configureLatrGateway,
  DEFAULT_DEV_LATR_GATEWAY_URL,
  DEFAULT_PROD_LATR_GATEWAY_URL,
  DEFAULT_TESTING_LATR_GATEWAY_URL,
  LOCAL_LATR_GATEWAY_URL,
  latrGatewayBaseUrl as sharedLatrGatewayBaseUrl,
  publishLatrGatewayWindowBootstrap,
  registerLatrGatewayConfigSync,
  type LatrGatewayWindowBootstrap,
} from "latr-web-client/latrGatewayConfig";

import { toLatrGatewayAppEnv } from "@/lib/environmentBanner";

export {
  LOCAL_LATR_GATEWAY_URL,
  DEFAULT_TESTING_LATR_GATEWAY_URL,
  DEFAULT_DEV_LATR_GATEWAY_URL,
  DEFAULT_PROD_LATR_GATEWAY_URL,
};

export type { LatrGatewayWindowBootstrap };

export const LATR_GATEWAY_PROXY_BASE_PATH = "/api/latr-gateway";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Read gateway client credential on the server only. */
export function readGatewayClientCredentialFromEnv(): string | undefined {
  return readEnv("LATR_GATEWAY_CLIENT_CREDENTIAL");
}

/** Read split gateway credentials on the server only. */
export function readGatewayClientCredentialsFromEnv(): {
  clientId?: string;
  apiKey?: string;
} {
  const clientId = readEnv("LATR_GATEWAY_CLIENT_ID");
  const apiKey = readEnv("LATR_GATEWAY_API_KEY");
  return {
    ...(clientId ? { clientId } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
}

function readWindowGatewayBootstrap(): LatrGatewayWindowBootstrap | undefined {
  if (typeof window === "undefined") return undefined;
  return window.__LATR_GATEWAY_BOOTSTRAP__;
}

export function browserLatrGatewayProxyBaseUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${LATR_GATEWAY_PROXY_BASE_PATH}`;
}

/** Push web env + current browser hostname into shared `latr-web-client` config. */
export function syncLatrGatewayFromBrowser(): void {
  let testingHostname: string | undefined;
  if (typeof window !== "undefined") {
    try {
      testingHostname = new URL(window.location.href).hostname;
    } catch {
      //
    }
  }

  const bootstrap = readWindowGatewayBootstrap();
  const gatewayUrl =
    browserLatrGatewayProxyBaseUrl() ??
    bootstrap?.gatewayUrl?.trim() ??
    process.env.NEXT_PUBLIC_LATR_GATEWAY_URL?.trim();
  const appEnv = bootstrap?.appEnv ?? toLatrGatewayAppEnv();

  configureLatrGateway({
    gatewayUrl,
    appEnv,
    testingHostname: testingHostname ?? "",
    clientCredential: "",
    clientId: "",
    apiKey: "",
  });

  publishLatrGatewayWindowBootstrap({
    ...(gatewayUrl ? { gatewayUrl } : {}),
    appEnv,
  });
}

registerLatrGatewayConfigSync(syncLatrGatewayFromBrowser);

/**
 * Base URL for `services/latr-gateway` API calls.
 * Hostname mapping wins over loopback overrides; non-loopback explicit URL wins otherwise.
 */
export function latrGatewayBaseUrl(): string {
  syncLatrGatewayFromBrowser();
  return sharedLatrGatewayBaseUrl();
}

function testingGatewayUrl(): string {
  const configured = process.env.NEXT_PUBLIC_LATR_GATEWAY_URL?.trim();
  return configured?.replace(/\/$/, "") ?? DEFAULT_TESTING_LATR_GATEWAY_URL;
}

/** Gateway API base for OAuth metadata when the SPA host maps to a hosted gateway. */
export function inferGatewayApiBase(origin?: string): string | null {
  if (origin) {
    try {
      const { hostname } = new URL(origin);
      if (hostname === "testing.latr.link") {
        return testingGatewayUrl();
      }
    } catch {
      //
    }
  }
  return null;
}

export function buildGatewayWindowBootstrap(
  appEnv: ReturnType<typeof toLatrGatewayAppEnv>
): LatrGatewayWindowBootstrap {
  const gatewayUrl = process.env.NEXT_PUBLIC_LATR_GATEWAY_URL?.trim();
  return {
    ...(gatewayUrl ? { gatewayUrl } : {}),
    appEnv,
  };
}
