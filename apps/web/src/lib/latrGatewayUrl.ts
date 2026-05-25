import { getAppEnv } from "@/lib/environmentBanner";

export const LOCAL_LATR_GATEWAY_URL = "http://127.0.0.1:8080";
export const DEFAULT_TESTING_LATR_GATEWAY_URL = "https://api.testing.latr.link";
export const DEFAULT_DEV_LATR_GATEWAY_URL =
  "https://latr-link-dev-gateway.fly.dev";
export const DEFAULT_PROD_LATR_GATEWAY_URL =
  "https://latr-link-prod-gateway.fly.dev";

/**
 * Base URL for `services/latr-gateway` API calls.
 * Explicit `NEXT_PUBLIC_LATR_GATEWAY_URL` wins; otherwise resolved from app env.
 */
export function latrGatewayBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_LATR_GATEWAY_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  switch (getAppEnv()) {
    case "prod":
      return DEFAULT_PROD_LATR_GATEWAY_URL;
    case "dev":
      if (typeof window !== "undefined") {
        try {
          if (new URL(window.location.href).hostname === "testing.latr.link") {
            return DEFAULT_TESTING_LATR_GATEWAY_URL;
          }
        } catch {
          //
        }
      }
      return DEFAULT_DEV_LATR_GATEWAY_URL;
    default:
      return LOCAL_LATR_GATEWAY_URL;
  }
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
