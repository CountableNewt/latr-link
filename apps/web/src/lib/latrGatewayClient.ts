import { configureLatrGateway } from "latr-web-client/latrGatewayConfig";
import {
  latrGatewayFetch as sharedLatrGatewayFetch,
  latrGatewayJson as sharedLatrGatewayJson,
} from "latr-web-client/latrGatewayClient";

import { toLatrGatewayAppEnv } from "@/lib/environmentBanner";

export {
  LATR_API_KEY_HEADER,
  LATR_CLIENT_ID_HEADER,
  LATR_UPSTREAM_DPOP_HEADER,
} from "latr-web-client/latrGatewayClient";

export { latrGatewayBaseUrl } from "@/lib/latrGatewayUrl";

function syncWebGatewayConfig(): void {
  let testingHostname: string | undefined;
  if (typeof window !== "undefined") {
    try {
      testingHostname = new URL(window.location.href).hostname;
    } catch {
      //
    }
  }
  configureLatrGateway({
    gatewayUrl: process.env.NEXT_PUBLIC_LATR_GATEWAY_URL?.trim(),
    appEnv: toLatrGatewayAppEnv(),
    testingHostname,
    clientId: process.env.NEXT_PUBLIC_LATR_GATEWAY_CLIENT_ID?.trim(),
    apiKey: process.env.NEXT_PUBLIC_LATR_GATEWAY_API_KEY?.trim(),
  });
}

syncWebGatewayConfig();

export async function latrGatewayFetch(
  ...args: Parameters<typeof sharedLatrGatewayFetch>
): Promise<Response> {
  syncWebGatewayConfig();
  return sharedLatrGatewayFetch(...args);
}

export async function latrGatewayJson<T>(
  ...args: Parameters<typeof sharedLatrGatewayJson>
): Promise<T> {
  syncWebGatewayConfig();
  return sharedLatrGatewayJson<T>(...args);
}
