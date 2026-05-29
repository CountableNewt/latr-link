import { LATRKIT_DEV_OAUTH_SCOPES } from "@/lib/atprotoOAuthScopes";

export function buildConsoleOAuthClientMetadata(origin: string) {
  const base = origin.replace(/\/$/, "");
  return {
    client_id: `${base}/client-metadata.json`,
    application_type: "web",
    client_name: "LatrKit Developer Console",
    client_uri: base,
    dpop_bound_access_tokens: true,
    grant_types: ["authorization_code", "refresh_token"],
    redirect_uris: [`${base}/callback`],
    response_types: ["code"],
    scope: LATRKIT_DEV_OAUTH_SCOPES,
    token_endpoint_auth_method: "none",
  };
}
