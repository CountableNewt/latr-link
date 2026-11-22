import type { BeforeSendEvent } from "@vercel/analytics/next";

const PAGE_PATHS = new Set([
  "/", "/login", "/library", "/library/archive", "/library/settings", "/privacy", "/support",
]);

/** Retain aggregate page paths without OAuth parameters or saved-link state. */
export function analyticsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * SDK 2 exposes the page URL, but its collector reads document.referrer outside
 * beforeSend. Cancel visits with sensitive referrers rather than claiming to
 * scrub a field the SDK never passes to this hook.
 */
export function analyticsBeforeSend(
  event: BeforeSendEvent,
  referrer: string = ""
): BeforeSendEvent | null {
  if (event.type !== "pageview") return null;
  const url = analyticsUrl(event.url);
  if (!url || !PAGE_PATHS.has(new URL(url).pathname)) return null;
  if (referrer) {
    if (!analyticsUrl(referrer)) return null;
    const source = new URL(referrer);
    if (source.search || source.hash) return null;
  }
  return { ...event, url };
}
