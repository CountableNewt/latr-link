/**
 * Unauthenticated reads against the Bluesky App View (posts, public repo reads).
 */
import { Agent } from "@atproto/api";

export const BSKY_APPVIEW_PUBLIC = "https://public.api.bsky.app";

export const publicAppviewAgent = new Agent(BSKY_APPVIEW_PUBLIC);
