"use client";

import type { PointerEvent } from "react";
import { Columns2 } from "lucide-react";
import { CORNER_HANDLES, type CornerKey, type HandleRectPercent } from "@/lib/editor/handles";
import { useT } from "@/lib/i18n";

const HANDLE_CLASS =
  "absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-primary bg-background shadow";

/** Before/after divider over the canvas, driven by an invisible full-size range input. */
export function CompareOverlay({ split, onSplitChange }: { split: number; onSplitChange: (split: number) => void }) {
  const t = useT();
  return (
    <div
      className="absolute inset-0"
      // Keep the canvas's own drag-to-move / retouch handlers out of it.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ left: `${split * 100}%` }}
      >
        <span className="absolute top-1/2 left-1/2 flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-neutral-700 shadow">
          <Columns2 className="size-3.5" />
        </span>
      </div>
      <span className="pointer-events-none absolute top-2 left-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
        {t("overlay.original")}
      </span>
      <span className="pointer-events-none absolute top-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">
        {t("overlay.result")}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={split * 100}
        onChange={(e) => onSplitChange(Number(e.target.value) / 100)}
        aria-label={t("overlay.compare")}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}

interface SubjectHandlesProps {
  rect: HandleRectPercent;
  rotation: { deg: number; originXPct: number; originYPct: number } | null;
  onResizeStart: (e: PointerEvent<HTMLButtonElement>) => void;
  onResizeMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onResizeEnd: (e: PointerEvent<HTMLButtonElement>) => void;
}

/** Corner handles wrapping the (possibly rotated) subject, for resizing it. */
export function SubjectHandles({ rect, rotation, onResizeStart, onResizeMove, onResizeEnd }: SubjectHandlesProps) {
  const t = useT();
  return (
    <div
      className="absolute inset-0"
      style={
        rotation
          ? { transform: `rotate(${rotation.deg}deg)`, transformOrigin: `${rotation.originXPct}% ${rotation.originYPct}%` }
          : undefined
      }
    >
      {CORNER_HANDLES.map(({ key, x, y, cursor }) => (
        <button
          key={key}
          type="button"
          aria-label={t("overlay.resizeSubject")}
          className={HANDLE_CLASS}
          style={{ left: `${rect[x]}%`, top: `${rect[y]}%`, cursor }}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
        />
      ))}
    </div>
  );
}

interface CropOverlayProps {
  rect: HandleRectPercent;
  dragStart: (mode: "move" | CornerKey) => (e: PointerEvent<HTMLElement>) => void;
  dragMove: (e: PointerEvent<HTMLElement>) => void;
  dragEnd: (e: PointerEvent<HTMLElement>) => void;
}

/** The crop rectangle: drag its body to move it, its corners to resize it. */
export function CropOverlay({ rect, dragStart, dragMove, dragEnd }: CropOverlayProps) {
  const t = useT();
  return (
    <>
      <div
        className="absolute cursor-move border-2 border-dashed border-primary bg-primary/10"
        style={{
          left: `${rect.leftPct}%`,
          top: `${rect.topPct}%`,
          width: `${rect.rightPct - rect.leftPct}%`,
          height: `${rect.bottomPct - rect.topPct}%`,
        }}
        onPointerDown={dragStart("move")}
        onPointerMove={dragMove}
        onPointerUp={dragEnd}
      />
      {CORNER_HANDLES.map(({ key, x, y, cursor }) => (
        <button
          key={key}
          type="button"
          aria-label={t("overlay.adjustCrop")}
          className={HANDLE_CLASS}
          style={{ left: `${rect[x]}%`, top: `${rect[y]}%`, cursor }}
          onPointerDown={dragStart(key)}
          onPointerMove={dragMove}
          onPointerUp={dragEnd}
        />
      ))}
    </>
  );
}
