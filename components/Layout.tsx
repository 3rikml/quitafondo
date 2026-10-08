"use client";

import type { ReactNode } from "react";
import { ImagePlus, Scissors, SlidersHorizontal, TriangleAlert, UploadCloud, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "@/components/IconButton";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AppHeader({ onOpenImages, onOpenControls }: { onOpenImages: () => void; onOpenControls: () => void }) {
  return (
    <header className="flex items-center gap-3 border-b px-4 py-3.5 sm:px-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Scissors className="size-4" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 leading-tight">
        <h1 className="font-heading text-lg font-semibold tracking-tight">QuitaFondo</h1>
        <p className="hidden text-xs text-muted-foreground sm:block">Quita fondos de tus imágenes, 100% local y privado.</p>
      </div>
      <div className="ml-auto flex items-center gap-1 lg:hidden">
        <IconButton label="Ver imágenes" onClick={onOpenImages}>
          <ImagePlus />
        </IconButton>
        <IconButton label="Ver controles de edición" onClick={onOpenControls}>
          <SlidersHorizontal />
        </IconButton>
      </div>
      <ThemeToggle className="lg:ml-auto" />
    </header>
  );
}

export function UnsupportedBrowserBanner() {
  return (
    <p role="alert" className="flex items-start gap-2 border-b bg-destructive/10 px-5 py-2.5 text-sm text-destructive">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
      Tu navegador no es compatible: QuitaFondo necesita WebAssembly para quitar los fondos. Prueba con una versión
      reciente de Chrome, Edge, Firefox o Safari.
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
          <IconButton label="Cerrar" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        {children}
      </aside>
    </>
  );
}

export function DropHint() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-primary/10 p-6 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-background/95 px-10 py-8 text-center shadow-lg">
        <UploadCloud className="size-8 text-primary" strokeWidth={1.75} />
        <p className="text-base font-medium">Suelta tus imágenes para quitarles el fondo</p>
      </div>
    </div>
  );
}
