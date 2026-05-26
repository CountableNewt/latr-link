export const LOCAL_LATR_GATEWAY_URL = "http://127.0.0.1:8080";
export const DEFAULT_TESTING_LATR_GATEWAY_URL = "https://api.testing.latr.link";
export const DEFAULT_DEV_LATR_GATEWAY_URL =
  "https://latr-link-dev-gateway.fly.dev";
export const DEFAULT_PROD_LATR_GATEWAY_URL =
  "https://latr-link-prod-gateway.fly.dev";

export type LatrAppEnv = "local" | "dev" | "prod" | "test";

export type LatrGatewayEnvConfig = {
  /** Explicit gateway base URL (wins over app env defaults). */
  gatewayUrl?: string;
  appEnv?: LatrAppEnv;
  /** When app env is dev, use testing gateway for this hostname. */
  testingHostname?: string;
  clientId?: string;
  apiKey?: string;
};

let globalGatewayConfig: LatrGatewayEnvConfig = {
  appEnv: "local",
};

/** Configure gateway URL and client API key headers for the current runtime. */
export function configureLatrGateway(config: LatrGatewayEnvConfig): void {
  globalGatewayConfig = { ...globalGatewayConfig, ...config };
}

export function getLatrGatewayConfig(): LatrGatewayEnvConfig {
  return globalGatewayConfig;
}

export function latrGatewayBaseUrl(config: LatrGatewayEnvConfig = globalGatewayConfig): string {
  const configured = config.gatewayUrl?.trim();
  if (configured) return configured.replace(/\/$/, "");

  switch (config.appEnv ?? "local") {
    case "prod":
      return DEFAULT_PROD_LATR_GATEWAY_URL;
    case "dev":
      if (config.testingHostname === "testing.latr.link") {
        return DEFAULT_TESTING_LATR_GATEWAY_URL;
      }
      return DEFAULT_DEV_LATR_GATEWAY_URL;
    default:
      return LOCAL_LATR_GATEWAY_URL;
  }
}

export function latrGatewayClientHeaders(
  config: LatrGatewayEnvConfig = globalGatewayConfig
): Record<string, string> {
  const clientId = config.clientId?.trim();
  const apiKey = config.apiKey?.trim();
  if (!clientId || !apiKey) return {};
  return {
    "X-Latr-Client-Id": clientId,
    "X-Latr-API-Key": apiKey,
  };
}
