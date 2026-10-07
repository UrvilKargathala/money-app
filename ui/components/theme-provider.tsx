"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeChoice = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "moneymind-theme";

function resolveDark(choice: ThemeChoice): boolean {
  if (choice === "dark") return true;
  if (choice === "light") return false;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return false;
}

function readStored(): ThemeChoice {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "dark" || v === "light" || v === "system") return v;
  } catch {}
  return "light";
}

type ThemeContextValue = {
  theme: ThemeChoice;
  dark: boolean;
  setTheme: (choice: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  dark: false,
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Single owner of theme state: localStorage persistence, .dark class on
 * <html>, and OS changes while "system" is active. The boot script in
 * app/layout.tsx paints the first frame; this provider owns everything
 * after hydration. Server persistence (settings API) stays with the
 * settings save flow, which calls setTheme + PATCH together.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>("light");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    setDark(resolveDark(stored));
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      // Re-resolve only when following the system.
      const current = readStored();
      if (current === "system") {
        setDark(mq.matches);
        document.documentElement.classList.toggle("dark", mq.matches);
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((choice: ThemeChoice) => {
    setThemeState(choice);
    const isDark = resolveDark(choice);
    setDark(isDark);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {}
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  const value = useMemo(() => ({ theme, dark, setTheme }), [theme, dark, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
