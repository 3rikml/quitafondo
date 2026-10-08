"use client";

import { Columns2, Download, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/IconButton";

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

interface CanvasToolbarProps {
  formatLabel: string;
  isDownloading: boolean;
  onDownload: () => void;
  isComparing: boolean;
  canCompare: boolean;
  onToggleCompare: () => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
}

/** Floating actions over the canvas: quick download, before/after toggle and zoom. */
export function CanvasToolbar({
  formatLabel,
  isDownloading,
  onDownload,
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
      <div className="flex items-center gap-1.5">
        <Button size="sm" onClick={onDownload} disabled={isDownloading}>
          <Download />
          {isDownloading ? "Descargando…" : `Descargar ${formatLabel}`}
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
