"use client";

import { useEffect } from "react";

/**
 * Keeps the `dark` class on <html> in sync with the OS colour scheme while the
 * page is open. The initial class is set by the inline pre-paint script in the
 * layout (to avoid a flash of the wrong theme); this only handles later changes,
 * so the user does not have to reload after switching their system theme.
 *
 * Once the user picks an explicit theme via `ThemeToggle` (persisted to
 * `localStorage["theme"]`), that choice wins and this stops following the OS
 * — otherwise a system change would silently override a deliberate pick.
 */
export function ThemeSync() {
  useEffect(() => {
    if (localStorage.getItem("theme")) return;

    const query = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = (matches: boolean) => {
      document.documentElement.classList.toggle("dark", matches);
    };

    apply(query.matches);
    const onChange = (event: MediaQueryListEvent) => apply(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return null;
}
