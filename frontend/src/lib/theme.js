import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";

const KEY = "agri-theme";

// Light or dark. A saved choice wins, otherwise the device setting. Storage can be blocked, so it is wrapped.
function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* ignore */ }
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export default function useTheme() {
  const [theme, setTheme] = useState(initial);
  useEffect(() => {
    try { localStorage.setItem(KEY, theme); } catch { /* ignore */ }
  }, [theme]);
  // Going dark is a sunset: the night comes down from the top of the screen. Going light is a sunrise: the
  // day rises from the bottom. Both use a soft, feathered edge (View Transitions, where the browser has them
  // and the person has not asked for less motion). Elsewhere the theme just switches.
  const toggle = useCallback(() => {
    const next = (t) => (t === "dark" ? "light" : "dark");
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!document.startViewTransition || calm) { setTheme(next); return; }
    const root = document.documentElement;
    root.dataset.themeSwap = theme === "dark" ? "to-light" : "to-dark";
    const run = document.startViewTransition(() => { flushSync(() => setTheme(next)); });
    run.finished.finally(() => { delete root.dataset.themeSwap; });
  }, [theme]);
  return { theme, toggle };
}
