import { describe, expect, test } from "bun:test";

import {
  fontLabel,
  isBoldTextPreference,
  isFontPreference,
  isThemePreference,
  resolveComputedTheme,
  themeLabel,
} from "./theme";

describe("Theme Preferences", () => {
  test("Validates Supported Preferences", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  test("Resolves Explicit Preferences Before System", () => {
    expect(resolveComputedTheme("light", true)).toBe("light");
    expect(resolveComputedTheme("dark", false)).toBe("dark");
  });

  test("Resolves System From Media Preference", () => {
    expect(resolveComputedTheme("system", true)).toBe("dark");
    expect(resolveComputedTheme("system", false)).toBe("light");
  });

  test("Formats Labels", () => {
    expect(themeLabel("light")).toBe("Light");
    expect(themeLabel("dark")).toBe("Dark");
    expect(themeLabel("system")).toBe("System");
  });

  test("Validates Supported Font Preferences", () => {
    expect(isFontPreference("sans")).toBe(true);
    expect(isFontPreference("serif")).toBe(true);
    expect(isFontPreference("mono")).toBe(true);
    expect(isFontPreference("display")).toBe(false);
    expect(isFontPreference(null)).toBe(false);
  });

  test("Formats Font Labels", () => {
    expect(fontLabel("sans")).toBe("Sans");
    expect(fontLabel("serif")).toBe("Serif");
    expect(fontLabel("mono")).toBe("Mono");
  });

  test("Validates Bold Text Preferences", () => {
    expect(isBoldTextPreference("1")).toBe(true);
    expect(isBoldTextPreference("0")).toBe(true);
    expect(isBoldTextPreference("true")).toBe(false);
    expect(isBoldTextPreference(null)).toBe(false);
  });
});
