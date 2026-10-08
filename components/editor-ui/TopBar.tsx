"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Columns2, Redo2, Scissors, Settings2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IconButton } from "@/components/IconButton";
import { setLocale, useLocale, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { ShortcutsList } from "./ShortcutsList";

interface TopBarProps {
  fileName: string | null;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  isComparing: boolean;
  canCompare: boolean;
  onToggleCompare: () => void;
  /** The download split button. */
  download: ReactNode;
}

/** Dark is the default; the class on <html> is the source of truth (set before paint in the layout). */
function useTheme(): ["dark" | "light", (theme: "dark" | "light") => void] {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the class the pre-paint script set, avoiding a hydration mismatch
    setTheme(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);
  const apply = (next: "dark" | "light") => {
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private mode: the choice lasts for this visit.
    }
  };
  return [theme, apply];
}

export function TopBar({
  fileName,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  isComparing,
  canCompare,
  onToggleCompare,
  download,
}: TopBarProps) {
  const t = useT();
  const locale = useLocale();
  const [theme, setTheme] = useTheme();

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_4px_14px_-4px_var(--primary)]">
          <Scissors className="size-4" strokeWidth={2.25} />
        </span>
        <h1 className="sr-only font-heading text-[15px] font-semibold tracking-tight sm:not-sr-only">QuitaFondo</h1>
        {fileName && (
          <>
            <span className="hidden h-5 w-px bg-border md:block" aria-hidden="true" />
            <span className="hidden max-w-[22ch] truncate text-sm text-muted-foreground md:inline" title={fileName}>
              {fileName}
            </span>
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <IconButton label={t("history.undo")} size="icon" variant="ghost" disabled={!canUndo} onClick={onUndo}>
          <Undo2 />
        </IconButton>
        <IconButton label={t("history.redo")} size="icon" variant="ghost" disabled={!canRedo} onClick={onRedo}>
          <Redo2 />
        </IconButton>
        <Button
          variant={isComparing ? "secondary" : "ghost"}
          aria-pressed={isComparing}
          disabled={!canCompare}
          onClick={onToggleCompare}
          className={cn("h-9 px-2.5", isComparing && "text-primary")}
        >
          <Columns2 />
          <span className="hidden sm:inline">{t("toolbar.compare")}</span>
        </Button>

        <Popover>
          <PopoverTrigger
            render={<Button size="icon" variant="ghost" aria-label={t("topbar.settings")} title={t("topbar.settings")} />}
          >
            <Settings2 />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 gap-4 p-4">
            <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 text-sm">
              <span className="text-muted-foreground">{t("topbar.theme")}</span>
              <Tabs value={theme} onValueChange={(next) => setTheme(next as "dark" | "light")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="dark">{t("topbar.themeDark")}</TabsTrigger>
                  <TabsTrigger value="light">{t("topbar.themeLight")}</TabsTrigger>
                </TabsList>
              </Tabs>
              <span className="text-muted-foreground">{t("topbar.language")}</span>
              <Tabs value={locale} onValueChange={(next) => setLocale(next as "es" | "en")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="es">Español</TabsTrigger>
                  <TabsTrigger value="en">English</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div className="flex flex-col gap-2 border-t pt-3">
              <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {t("toolbar.shortcuts")}
              </span>
              <ShortcutsList />
            </div>
          </PopoverContent>
        </Popover>

        <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
        {download}
      </div>
    </header>
  );
}
