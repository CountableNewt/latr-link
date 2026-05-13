import { describe, expect, test } from "bun:test";
import { normalizeUrl } from "./normalize";

describe("normalizeUrl", () => {
  test("lowercases host and scheme", () => {
    expect(normalizeUrl("HTTPS://Example.COM/foo")).toBe(
      "https://example.com/foo"
    );
  });

  test("strips fragment", () => {
    expect(normalizeUrl("https://a.com/x#y")).toBe("https://a.com/x");
  });

  test("drops utm and tracking params", () => {
    expect(
      normalizeUrl(
        "https://a.com/p?utm_source=x&ok=1&utm_campaign=z&fbclid=1&gclid=g&ref=r"
      )
    ).toBe("https://a.com/p?ok=1");
  });

  test("rejects non-http", () => {
    expect(normalizeUrl("ftp://a.com")).toBeNull();
  });
});
