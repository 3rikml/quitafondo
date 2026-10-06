"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { cn } from "@/lib/utils";

/**
 * Lets the user override the OS-driven theme (see `ThemeSync`). Starts
 * `null` until mounted so the icon only renders once it can read the real
 * `<html>` class — avoids a server/client mismatch, since the pre-paint
 * script (not React) is what sets that class on first load.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the class the pre-paint script (not React) set, to avoid a server/client hydration mismatch
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <IconButton
      label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      onClick={toggle}
      className={cn("shrink-0", className)}
    >
      {isDark === null ? null : isDark ? <Sun /> : <Moon />}
    </IconButton>
  );
}
