"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  BOLD_TEXT_STORAGE_KEY,
  FONT_STORAGE_KEY,
  isBoldTextPreference,
  isFontPreference,
  isThemePreference,
  resolveComputedTheme,
  THEME_STORAGE_KEY,
  type ComputedTheme,
  type FontPreference,
  type ThemePreference,
} from "@/lib/theme";

type ThemeContextValue = {
  preference: ThemePreference;
  computedTheme: ComputedTheme;
  setPreference: (preference: ThemePreference) => void;
  fontPreference: FontPreference;
  setFontPreference: (preference: FontPreference) => void;
  boldText: boolean;
  setBoldText: (enabled: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const appearanceSubscribers = new Set<() => void>();
const SERVER_SNAPSHOT = "system|sans|0|light";

function readStoredPreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function readStoredFontPreference(): FontPreference {
  if (typeof window === "undefined") return "sans";
  try {
    const stored = window.localStorage.getItem(FONT_STORAGE_KEY);
    return isFontPreference(stored) ? stored : "sans";
  } catch {
    return "sans";
  }
}

function readStoredBoldText(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = window.localStorage.getItem(BOLD_TEXT_STORAGE_KEY);
    return isBoldTextPreference(stored) ? stored === "1" : false;
  } catch {
    return false;
  }
}

function readSystemDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getAppearanceSnapshot(): string {
  const preference = readStoredPreference();
  const fontPreference = readStoredFontPreference();
  const boldText = readStoredBoldText() ? "1" : "0";
  const systemTheme = readSystemDark() ? "dark" : "light";
  return `${preference}|${fontPreference}|${boldText}|${systemTheme}`;
}

function parseAppearanceSnapshot(snapshot: string): {
  preference: ThemePreference;
  fontPreference: FontPreference;
  boldText: boolean;
  systemDark: boolean;
} {
  const [preference, fontPreference, boldText, systemTheme] = snapshot.split("|");
  return {
    preference: isThemePreference(preference) ? preference : "system",
    fontPreference: isFontPreference(fontPreference) ? fontPreference : "sans",
    boldText: isBoldTextPreference(boldText) ? boldText === "1" : false,
    systemDark: systemTheme === "dark",
  };
}

function subscribeToAppearance(listener: () => void): () => void {
  appearanceSubscribers.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", listener);
  window.addEventListener("storage", listener);

  return () => {
    appearanceSubscribers.delete(listener);
    media.removeEventListener("change", listener);
    window.removeEventListener("storage", listener);
  };
}

function notifyAppearanceChanged() {
  appearanceSubscribers.forEach((listener) => listener());
}

function applyAppearance(
  preference: ThemePreference,
  systemDark: boolean,
  fontPreference: FontPreference,
  boldText: boolean
) {
  const computed = resolveComputedTheme(preference, systemDark);
  const root = document.documentElement;
  root.classList.toggle("dark", computed === "dark");
  root.classList.toggle("light", computed === "light");
  root.dataset.theme = preference;
  root.dataset.computedTheme = computed;
  root.dataset.font = fontPreference;
  root.dataset.boldText = boldText ? "true" : "false";
  root.style.colorScheme = computed;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const snapshot = useSyncExternalStore(
    subscribeToAppearance,
    getAppearanceSnapshot,
    () => SERVER_SNAPSHOT
  );
  const { preference, fontPreference, boldText, systemDark } =
    parseAppearanceSnapshot(snapshot);

  useEffect(() => {
    applyAppearance(preference, systemDark, fontPreference, boldText);
  }, [boldText, fontPreference, preference, systemDark]);

  const setPreference = useCallback(
    (nextPreference: ThemePreference) => {
      try {
        if (nextPreference === "system") {
          window.localStorage.removeItem(THEME_STORAGE_KEY);
        } else {
          window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
        }
      } catch {
        /* ignore storage failures */
      }
      notifyAppearanceChanged();
    },
    []
  );

  const setFontPreference = useCallback(
    (nextPreference: FontPreference) => {
      try {
        if (nextPreference === "sans") {
          window.localStorage.removeItem(FONT_STORAGE_KEY);
        } else {
          window.localStorage.setItem(FONT_STORAGE_KEY, nextPreference);
        }
      } catch {
        /* ignore storage failures */
      }
      notifyAppearanceChanged();
    },
    []
  );

  const setBoldText = useCallback((enabled: boolean) => {
    try {
      if (enabled) {
        window.localStorage.setItem(BOLD_TEXT_STORAGE_KEY, "1");
      } else {
        window.localStorage.removeItem(BOLD_TEXT_STORAGE_KEY);
      }
    } catch {
      /* ignore storage failures */
    }
    notifyAppearanceChanged();
  }, []);

  const value = useMemo(
    () => ({
      preference,
      computedTheme: resolveComputedTheme(preference, systemDark),
      setPreference,
      fontPreference,
      setFontPreference,
      boldText,
      setBoldText,
    }),
    [
      boldText,
      fontPreference,
      preference,
      setBoldText,
      setFontPreference,
      setPreference,
      systemDark,
    ]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within <ThemeProvider>");
  return context;
}
