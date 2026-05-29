import { buildAtprotoLoopbackClientId } from "@atproto/oauth-types";

import { LATRKIT_DEV_OAUTH_SCOPES } from "@/lib/atprotoOAuthScopes";
import { getAppEnv } from "@/lib/environmentBanner";

export function resolveOAuthResponseMode(): "fragment" | "query" {
  return process.env.NEXT_PUBLIC_OAUTH_RESPONSE_MODE === "query"
    ? "query"
    : "fragment";
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

export function isLocalOAuthMode(): boolean {
  if (
    getAppEnv() === "local" ||
    process.env.NEXT_PUBLIC_ATPROTO_LOCAL === "true"
  ) {
    return true;
  }
  if (
    typeof window !== "undefined" &&
    isLoopbackHostname(window.location.hostname)
  ) {
    return true;
  }
  return false;
}

export function resolveClientId(): string {
  const manual = process.env.NEXT_PUBLIC_LOCAL_OAUTH_CLIENT_ID?.trim();
  if (manual) return manual;

  if (!isLocalOAuthMode()) {
    const explicit = process.env.NEXT_PUBLIC_ATPROTO_CLIENT_ID?.trim();
    if (explicit) return explicit;
    if (typeof window !== "undefined") {
      return `${window.location.origin}/client-metadata.json`;
    }
    return "https://latrkit.dev/client-metadata.json";
  }

  if (typeof window === "undefined") {
    throw new Error("resolveClientId requires the browser in local OAuth mode");
  }

  const redirectUri =
    process.env.NEXT_PUBLIC_LOCAL_REDIRECT_URI?.trim() ??
    buildDefaultLocalCallbackUrl();

  return buildAtprotoLoopbackClientId({
    scope: LATRKIT_DEV_OAUTH_SCOPES,
    redirect_uris: [redirectUri],
  });
}

export function buildDefaultLocalCallbackUrl(): string {
  const u = new URL(window.location.href);
  if (u.hostname === "localhost") u.hostname = "127.0.0.1";
  u.pathname = "/callback";
  u.search = "";
  u.hash = "";
  return u.toString();
}

export function readOAuthCallbackParamsFromWindow(): URLSearchParams | null {
  if (typeof window === "undefined") return null;
  const mode = resolveOAuthResponseMode();
  if (mode === "query") {
    return new URLSearchParams(window.location.search);
  }
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return hash ? new URLSearchParams(hash) : null;
}

export function hasPendingOAuthBrowserCallback(): boolean {
  const params = readOAuthCallbackParamsFromWindow();
  if (!params) return false;
  return params.has("code") || params.has("error");
}
