"use client";

import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { useT } from "@/lib/i18n";

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

/** Floating zoom pill at the bottom of the stage. */
export function ZoomPill({ zoom, onZoomChange }: { zoom: number; onZoomChange: (zoom: number) => void }) {
  const t = useT();
  const step = (direction: 1 | -1) =>
    onZoomChange(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((zoom + direction * ZOOM_STEP) * 100) / 100)));
  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border bg-popover/90 p-1 shadow-lg backdrop-blur">
      <IconButton label={t("toolbar.zoomOut")} size="icon-sm" className="rounded-full" disabled={zoom <= ZOOM_MIN} onClick={() => step(-1)}>
        <ZoomOut />
      </IconButton>
      <span className="w-11 text-center font-mono text-[11px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <IconButton label={t("toolbar.zoomIn")} size="icon-sm" className="rounded-full" disabled={zoom >= ZOOM_MAX} onClick={() => step(1)}>
        <ZoomIn />
      </IconButton>
      <IconButton label={t("stage.fit")} size="icon-sm" className="rounded-full" disabled={zoom === 1} onClick={() => onZoomChange(1)}>
        <Maximize2 />
      </IconButton>
    </div>
  );
}

/** Short instruction for the active tool, floating at the top of the stage. */
export function StageHint({ text }: { text: string }) {
  return (
    <div
      role="status"
      className="pointer-events-none max-w-[90%] rounded-full border bg-popover/90 px-3.5 py-1.5 text-center text-xs text-popover-foreground shadow-lg backdrop-blur"
    >
      {text}
    </div>
  );
}
