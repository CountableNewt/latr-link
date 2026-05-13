/**
 * Conservative URL normalization (v1): lowercase scheme + host, strip fragment,
 * drop common tracking query params, normalize trailing slash.
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "ref",
]);

function stripTracking(searchParams: URLSearchParams): void {
  const toDelete: string[] = [];
  for (const key of searchParams.keys()) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || TRACKING_PARAMS.has(lower)) {
      toDelete.push(key);
    }
  }
  for (const k of toDelete) {
    searchParams.delete(k);
  }
}

/**
 * Returns a canonical normalized URL string or `null` if input is not http(s).
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }

  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  url.hash = "";

  stripTracking(url.searchParams);

  // Sort params for stability (optional but helps dedupe)
  url.searchParams.sort();

  // Trailing slash: drop except for root path "/"
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}
