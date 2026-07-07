import { describe, expect, test } from "bun:test";

import { isLatrDemoDataEnabled } from "./demoMode";

describe("L@tr Demo Data Mode", () => {
  test("Requires an explicit flag", () => {
    expect(isLatrDemoDataEnabled("local", undefined)).toBe(false);
    expect(isLatrDemoDataEnabled("local", "0")).toBe(false);
    expect(isLatrDemoDataEnabled("local", "1")).toBe(true);
  });

  test("Only Enables in Local App Env", () => {
    expect(isLatrDemoDataEnabled("prod", "1")).toBe(false);
    expect(isLatrDemoDataEnabled("dev", "1")).toBe(false);
    expect(isLatrDemoDataEnabled("test", "1")).toBe(false);
    expect(isLatrDemoDataEnabled("production", "1")).toBe(false);
  });
});

