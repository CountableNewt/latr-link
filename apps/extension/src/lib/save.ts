import type { OAuthSession } from "@atproto/oauth-client-browser";
import { saveCurrentUrl, type SaveCurrentUrlResult } from "latr-web-client/saveCurrentUrl";

import { syncExtensionGatewayConfig } from "./config";

export async function saveTabUrl(
  url: string,
  session: OAuthSession
): Promise<SaveCurrentUrlResult> {
  syncExtensionGatewayConfig();
  return saveCurrentUrl(url, session);
}
