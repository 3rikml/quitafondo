"use client";

import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { useT } from "@/lib/i18n";
import { ZOOM_MAX, ZOOM_MIN, type Viewport } from "@/lib/editor/viewport";

const ZOOM_STEP = 1.25;

interface ZoomPillProps {
  view: Viewport;
  onZoomChange: (zoom: number) => void;
  onFit: () => void;
}

/** Floating zoom pill at the bottom of the stage. */
export function ZoomPill({ view, onZoomChange, onFit }: ZoomPillProps) {
  const t = useT();
  const { zoom } = view;
  const fitted = zoom === 1 && view.panX === 0 && view.panY === 0;
  const step = (direction: 1 | -1) => onZoomChange(Math.round(zoom * ZOOM_STEP ** direction * 100) / 100);
  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-full border bg-popover/90 p-1 shadow-lg backdrop-blur">
      <IconButton label={t("toolbar.zoomOut")} size="icon-sm" className="rounded-full" disabled={zoom <= ZOOM_MIN} onClick={() => step(-1)}>
        <ZoomOut />
      </IconButton>
      <span className="w-11 text-center font-mono text-[11px] tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <IconButton label={t("toolbar.zoomIn")} size="icon-sm" className="rounded-full" disabled={zoom >= ZOOM_MAX} onClick={() => step(1)}>
        <ZoomIn />
      </IconButton>
      <IconButton label={t("stage.fit")} size="icon-sm" className="rounded-full" disabled={fitted} onClick={onFit}>
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
