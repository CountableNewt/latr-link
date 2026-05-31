import {
  configureLatrGateway,
  DEFAULT_DEV_LATR_GATEWAY_URL,
  DEFAULT_PROD_LATR_GATEWAY_URL,
  DEFAULT_TESTING_LATR_GATEWAY_URL,
  LOCAL_LATR_GATEWAY_URL,
  latrGatewayBaseUrl as sharedLatrGatewayBaseUrl,
} from "latr-web-client/latrGatewayConfig";

import { toLatrGatewayAppEnv } from "@/lib/environmentBanner";

export {
  LOCAL_LATR_GATEWAY_URL,
  DEFAULT_TESTING_LATR_GATEWAY_URL,
  DEFAULT_DEV_LATR_GATEWAY_URL,
  DEFAULT_PROD_LATR_GATEWAY_URL,
};

/** Credential from the server layout (runtime env); wins over client `process.env`. */
let injectedGatewayClientCredential: string | undefined;
let injectedGatewayClientId: string | undefined;
let injectedGatewayApiKey: string | undefined;

export function setInjectedGatewayClientCredential(
  credential: string | undefined
): void {
  const trimmed = credential?.trim();
  injectedGatewayClientCredential = trimmed || undefined;
}

export function setInjectedGatewayClientCredentials(credentials: {
  clientId?: string;
  apiKey?: string;
}): void {
  const clientId = credentials.clientId?.trim();
  const apiKey = credentials.apiKey?.trim();
  injectedGatewayClientId = clientId || undefined;
  injectedGatewayApiKey = apiKey || undefined;
}

/** Read gateway client credential on the server (layout) or from build-time env. */
export function readGatewayClientCredentialFromEnv(): string | undefined {
  const fromEnv = process.env.LATR_GATEWAY_CLIENT_CREDENTIAL?.trim();
  return fromEnv || undefined;
}

/** Read split gateway credentials on the server (layout) or from build-time env. */
export function readGatewayClientCredentialsFromEnv(): {
  clientId?: string;
  apiKey?: string;
} {
  const clientId = process.env.LATR_GATEWAY_CLIENT_ID?.trim();
  const apiKey = process.env.LATR_GATEWAY_API_KEY?.trim();
  return {
    ...(clientId ? { clientId } : {}),
    ...(apiKey ? { apiKey } : {}),
  };
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
  const credential =
    injectedGatewayClientCredential ?? readGatewayClientCredentialFromEnv();
  const splitFromInjection =
    injectedGatewayClientId && injectedGatewayApiKey
      ? { clientId: injectedGatewayClientId, apiKey: injectedGatewayApiKey }
      : undefined;
  const splitFromEnv = readGatewayClientCredentialsFromEnv();
  const clientId = splitFromInjection?.clientId ?? splitFromEnv.clientId;
  const apiKey = splitFromInjection?.apiKey ?? splitFromEnv.apiKey;
  configureLatrGateway({
    gatewayUrl: process.env.NEXT_PUBLIC_LATR_GATEWAY_URL?.trim(),
    appEnv: toLatrGatewayAppEnv(),
    testingHostname,
    ...(credential ? { clientCredential: credential } : {}),
    ...(clientId && apiKey ? { clientId, apiKey } : {}),
  });
}

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
