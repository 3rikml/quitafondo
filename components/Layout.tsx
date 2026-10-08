"use client";

import type { ReactNode } from "react";
import { ImagePlus, Languages, Scissors, SlidersHorizontal, TriangleAlert, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/IconButton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { setLocale, useLocale, useT } from "@/lib/i18n";

export function AppHeader({ onOpenImages, onOpenControls }: { onOpenImages: () => void; onOpenControls: () => void }) {
  const t = useT();
  const locale = useLocale();
  return (
    <header className="flex items-center gap-3 border-b px-4 py-3.5 sm:px-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Scissors className="size-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 leading-tight">
        <h1 className="font-heading text-lg font-semibold tracking-tight">QuitaFondo</h1>
        <p className="hidden text-xs text-muted-foreground sm:block">{t("header.tagline")}</p>
      </div>
      <div className="ml-auto flex items-center gap-1 lg:hidden">
        <IconButton label={t("header.openImages")} onClick={onOpenImages}>
          <ImagePlus />
        </IconButton>
        <IconButton label={t("header.openControls")} onClick={onOpenControls}>
          <SlidersHorizontal />
        </IconButton>
      </div>
      <IconButton
        label={t("header.language")}
        className="w-auto shrink-0 gap-1 px-2 lg:ml-auto"
        onClick={() => setLocale(locale === "es" ? "en" : "es")}
      >
        <Languages />
        <span className="text-xs font-semibold uppercase">{locale === "es" ? "EN" : "ES"}</span>
      </IconButton>
      <ThemeToggle />
    </header>
  );
}

export function UnsupportedBrowserBanner() {
  const t = useT();
  return (
    <p role="alert" className="flex items-start gap-2 border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      {t("header.unsupported")}
    </p>
  );
}

interface SidePanelProps {
  side: "left" | "right";
  title: string;
  /** Only meaningful below `lg`, where the panel is a slide-over drawer; at `lg` and up it is always shown. */
  open: boolean;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}

/** A permanent side column on desktop that turns into a slide-over drawer on small screens. */
export function SidePanel({ side, title, open, onClose, className, children }: SidePanelProps) {
  const t = useT();
  const isLeft = side === "left";
  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={cn(
          "fixed inset-y-0 z-50 w-[85vw] max-w-xs overflow-y-auto bg-background p-4 shadow-xl transition-transform duration-200 lg:static lg:z-auto lg:max-w-none lg:translate-x-0 lg:shadow-none",
          isLeft ? "left-0 border-r" : "right-0 border-l",
          open ? "translate-x-0" : isLeft ? "-translate-x-full" : "translate-x-full",
          className
        )}
      >
        <div className="mb-3 flex items-center justify-between lg:hidden">
          <h2 className="text-sm font-semibold">{title}</h2>
          <IconButton label={t("common.close")} onClick={onClose}>
            <X />
          </IconButton>
        </div>
        {children}
      </aside>
    </>
  );
}

export function DropHint() {
  const t = useT();
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-primary/10 p-6 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-background/95 px-10 py-8 text-center shadow-lg">
        <UploadCloud className="size-8 text-primary" strokeWidth={1.75} />
        <p className="text-base font-medium">{t("dropzone.dropHint")}</p>
      </div>
    </div>
  );
}
