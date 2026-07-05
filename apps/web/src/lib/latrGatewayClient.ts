import {
  latrGatewayFetch as sharedLatrGatewayFetch,
  latrGatewayJson as sharedLatrGatewayJson,
} from "latr-web-client/latrGatewayClient";

import {
  latrGatewayBaseUrl,
  syncLatrGatewayFromBrowser,
} from "@/lib/latrGatewayUrl";

export {
  LATR_OFFICIAL_CLIENT_HEADER,
  LATR_UPSTREAM_DPOP_HEADER,
} from "latr-web-client/latrGatewayClient";

export { latrGatewayBaseUrl };

export async function latrGatewayFetch(
  ...args: Parameters<typeof sharedLatrGatewayFetch>
): Promise<Response> {
  syncLatrGatewayFromBrowser();
  args[3] = { ...args[3], skipClientCredential: true };
  return sharedLatrGatewayFetch(...args);
}

export async function latrGatewayJson<T>(
  ...args: Parameters<typeof sharedLatrGatewayJson>
): Promise<T> {
  syncLatrGatewayFromBrowser();
  args[3] = { ...args[3], skipClientCredential: true };
  return sharedLatrGatewayJson<T>(...args);
}
