import {
  configureLatrGateway,
  type LatrAppEnv,
} from "latr-web-client/latrGatewayConfig";

export function syncLatrGatewayFromBrowser(): void {
  const appEnv = (process.env.NEXT_PUBLIC_APP_ENV?.trim() ?? "local") as LatrAppEnv;
  configureLatrGateway({
    gatewayUrl: process.env.NEXT_PUBLIC_LATR_GATEWAY_URL,
    appEnv,
    testingHostname:
      typeof window !== "undefined" ? window.location.hostname : undefined,
  });
}
