"use client";

import { useEffect } from "react";

/**
 * Keeps the `dark` class on <html> in sync with the OS colour scheme while the
 * page is open. The initial class is set by the inline pre-paint script in the
 * layout (to avoid a flash of the wrong theme); this only handles later changes,
 * so the user does not have to reload after switching their system theme.
 */
export function ThemeSync() {
  useEffect(() => {
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
