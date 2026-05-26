import { describe, expect, test } from "bun:test";

import { isSupportedSaveUrl } from "latr-web-client/saveCurrentUrl";

describe("extension save URL guards", () => {
  test("rejects extension internal pages", () => {
    expect(
      isSupportedSaveUrl("chrome-extension://abcdefghijklmnop/popup.html")
    ).toBe(false);
  });
});
