"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  resolveTheme,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/lib/theme";

interface ThemeState {
  /** The raw user choice: light / dark / follow OS. */
  choice: ThemeChoice;
  /** The concrete theme currently painted on `<html>`. */
  resolved: ResolvedTheme;
  setChoice: (c: ThemeChoice) => void;
  /** Quick toggle between light and dark (ignores "system"). */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

function readInitialChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const s = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (s === "light" || s === "dark" || s === "system") return s;
  } catch {
    /* ignore */
  }
  return "system";
}

function readPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/**
 * Provider for the theme toggle. The no-FOUC inline script in <head>
 * already set `documentElement.dataset.theme` before React hydrated —
 * this context just keeps React state in sync with localStorage + the
 * `prefers-color-scheme` media query, so subsequent toggles persist and
 * the UI reflects the correct current theme.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(() =>
    readInitialChoice(),
  );
  const [prefersDark, setPrefersDark] = useState<boolean>(() => readPrefersDark());

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  const resolved = resolveTheme(choice, prefersDark);

  // Reflect the resolved theme on <html> any time it changes.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, c);
    } catch {
      /* storage full / disabled — not fatal */
    }
  }, []);

  const toggle = useCallback(() => {
    setChoice(resolved === "dark" ? "light" : "dark");
  }, [resolved, setChoice]);

  const value = useMemo<ThemeState>(
    () => ({ choice, resolved, setChoice, toggle }),
    [choice, resolved, setChoice, toggle],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}
