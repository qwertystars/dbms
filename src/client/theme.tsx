import { useCallback, useEffect, useState } from "react";

// Notebook is the light theme and Slate the dark one (brand spec §3.4).
// With no stored choice the theme follows the operating system; see the inline
// script in index.html, which applies a stored choice before first paint.
export type Theme = "notebook" | "slate";

const STORAGE_KEY = "bn-theme";
const darkQuery = "(prefers-color-scheme: dark)";

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "notebook" || value === "slate" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia(darkQuery).matches ? "slate" : "notebook";
}

export function useTheme() {
  const [stored, setStored] = useState<Theme | null>(readStored);
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const media = window.matchMedia(darkQuery);
    const onChange = () => setSystem(systemTheme());
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const theme = stored ?? system;

  const toggle = useCallback(() => {
    const next: Theme = theme === "slate" ? "notebook" : "slate";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice then lasts for this page only.
    }
    setStored(next);
  }, [theme]);

  return { theme, toggle };
}
