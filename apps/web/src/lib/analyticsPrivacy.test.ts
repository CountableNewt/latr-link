import { describe, expect, test } from "bun:test";
import { analyticsBeforeSend, analyticsUrl } from "./analyticsPrivacy";

describe("aggregate analytics privacy", () => {
  test("removes OAuth, tag and save URL query values and fragments", () => {
    for (const path of ["/callback?code=secret&state=private#token", "/library?tag=private&url=https%3A%2F%2Fsecret.example#article"]) {
      const clean = analyticsUrl(`https://latr.link${path}`);
      expect(clean).toBe(`https://latr.link${path.split(/[?#]/)[0]}`);
    }
  });
  test("rejects malformed, non-HTTP and credential-bearing page URLs", () => {
    for (const url of ["invalid", "/relative", "javascript:alert(1)", "file:///tmp/private", "https://user:secret@example.com/"]) {
      expect(analyticsBeforeSend({ type: "pageview", url })).toBeNull();
    }
  });
  test("retains clean page paths and clean external referrers", () => {
    expect(analyticsBeforeSend({ type: "pageview", url: "https://latr.link/library?tag=private#saved" }, "https://example.com/story"))
      .toEqual({ type: "pageview", url: "https://latr.link/library" });
  });
  test("cancels events when the SDK's unmodifiable referrer contains private data", () => {
    for (const referrer of ["https://auth.example/callback?code=secret", "https://latr.link/library?tag=private", "https://example.com/#private", "https://user:secret@example.com/", "malformed", "data:text/plain,private"]) {
      expect(analyticsBeforeSend({ type: "pageview", url: "https://latr.link/" }, referrer)).toBeNull();
    }
  });
  test("allows direct visits and refuses custom events", () => {
    expect(analyticsBeforeSend({ type: "pageview", url: "https://latr.link/" }, ""))
      .toEqual({ type: "pageview", url: "https://latr.link/" });
    expect(analyticsBeforeSend({ type: "event", url: "https://latr.link/" })).toBeNull();
  });
});

test("only known public and library pages emit pageviews", () => {
  for (const path of ["/", "/login", "/library", "/library/archive", "/library/settings", "/privacy", "/support"]) {
    expect(analyticsBeforeSend({ type: "pageview", url: `https://latr.link${path}?private=secret#state` }))
      .toEqual({ type: "pageview", url: `https://latr.link${path}` });
  }
  for (const path of ["/callback?code=secret", "/extension/callback?code=secret", "/unknown/private-id", "/library/private-id", "/api/latr-gateway/private-id"]) {
    expect(analyticsBeforeSend({ type: "pageview", url: `https://latr.link${path}` })).toBeNull();
  }
});
