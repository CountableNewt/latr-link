import { describe, expect, test } from "bun:test";

import { isSupportedSaveUrl } from "./saveCurrentUrl";

describe("isSupportedSaveUrl", () => {
  test("accepts https URLs", () => {
    expect(isSupportedSaveUrl("https://example.com/article")).toBe(true);
  });

  test("rejects browser-internal URLs", () => {
    expect(isSupportedSaveUrl("chrome://newtab/")).toBe(false);
    expect(isSupportedSaveUrl("chrome-extension://abc/popup.html")).toBe(false);
  });

  test("rejects empty input", () => {
    expect(isSupportedSaveUrl("")).toBe(false);
  });
});
