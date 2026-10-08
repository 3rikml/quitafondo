"use client";

import { Check, Columns2, Copy, Download, Keyboard, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconButton } from "@/components/IconButton";

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

/** Shown in the shortcuts popover; handled in `app/page.tsx`. */
const SHORTCUTS: [keys: string, action: string][] = [
  ["D", "Descargar"],
  ["Ctrl/⌘ + Shift + C", "Copiar imagen"],
  ["C", "Comparar antes/después"],
  ["B", "Activar/desactivar pincel"],
  ["[  ]", "Tamaño del pincel"],
  ["Ctrl/⌘ + Z", "Deshacer"],
  ["Ctrl/⌘ + Shift + Z", "Rehacer"],
  ["Ctrl/⌘ + V", "Pegar una imagen"],
  ["Esc", "Salir de la herramienta"],
];

export type CopyState = "idle" | "copying" | "copied" | "failed";

interface CanvasToolbarProps {
  formatLabel: string;
  isDownloading: boolean;
  onDownload: () => void;
  copyState: CopyState;
  onCopy: () => void;
  isComparing: boolean;
  canCompare: boolean;
  onToggleCompare: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

const COPY_LABEL: Record<CopyState, string> = {
  idle: "Copiar",
  copying: "Copiando…",
  copied: "Copiada",
  failed: "No se pudo copiar",
};

/** Floating actions over the canvas: download, copy, before/after toggle, shortcuts and zoom. */
export function CanvasToolbar({
  formatLabel,
  isDownloading,
  onDownload,
  copyState,
  onCopy,
  isComparing,
  canCompare,
  onToggleCompare,
  zoom,
  onZoomChange,
}: CanvasToolbarProps) {
  const stepZoom = (direction: 1 | -1) =>
    onZoomChange(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoom + direction * ZOOM_STEP) * 100) / 100)));

  return (
    <div className="pointer-events-none absolute inset-x-4 top-4 z-10 flex flex-wrap items-start justify-between gap-2 [&>*]:pointer-events-auto">
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" onClick={onDownload} disabled={isDownloading}>
          <Download />
          {isDownloading ? "Descargando…" : `Descargar ${formatLabel}`}
        </Button>
        <Button size="sm" variant="outline" onClick={onCopy} disabled={copyState === "copying"} aria-live="polite">
          {copyState === "copied" ? <Check /> : <Copy />}
          {COPY_LABEL[copyState]}
        </Button>
        <Button
          size="sm"
          variant={isComparing ? "secondary" : "outline"}
          aria-pressed={isComparing}
          onClick={onToggleCompare}
          disabled={!canCompare}
        >
          <Columns2 />
          Comparar
        </Button>
      </div>
      <div className="flex items-center gap-0.5 rounded-lg border bg-background/95 p-1 shadow-sm">
        <Popover>
          <PopoverTrigger
            render={<Button size="icon-sm" variant="ghost" className="size-7" aria-label="Atajos de teclado" />}
          >
            <Keyboard />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <p className="text-sm font-semibold">Atajos de teclado</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              {SHORTCUTS.map(([keys, action]) => (
                <div key={keys} className="contents">
                  <dt>
                    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{keys}</kbd>
                  </dt>
                  <dd className="text-muted-foreground">{action}</dd>
                </div>
              ))}
            </dl>
          </PopoverContent>
        </Popover>
        <IconButton label="Alejar" className="size-7" disabled={zoom <= ZOOM_MIN} onClick={() => stepZoom(-1)}>
          <ZoomOut />
        </IconButton>
        <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
        <IconButton label="Acercar" className="size-7" disabled={zoom >= ZOOM_MAX} onClick={() => stepZoom(1)}>
          <ZoomIn />
        </IconButton>
        <IconButton label="Restablecer zoom (100%)" className="size-7" disabled={zoom === 1} onClick={() => onZoomChange(1)}>
          <RotateCcw />
        </IconButton>
      </div>
    </div>
  );
}
