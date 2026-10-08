import type { BoundingBox } from "@/lib/image/boundingBox";

/** A box's on-screen position as percentages of the canvas's own pixel size. */
export interface HandleRectPercent {
  leftPct: number;
  topPct: number;
  rightPct: number;
  bottomPct: number;
}

/** Corner naming shared by the subject resize handles and the crop handles. */
export type CornerKey = "tl" | "tr" | "bl" | "br";

export const CORNER_HANDLES: {
  key: CornerKey;
  x: "leftPct" | "rightPct";
  y: "topPct" | "bottomPct";
  cursor: string;
}[] = [
  { key: "tl", x: "leftPct", y: "topPct", cursor: "nwse-resize" },
  { key: "tr", x: "rightPct", y: "topPct", cursor: "nesw-resize" },
  { key: "bl", x: "leftPct", y: "bottomPct", cursor: "nesw-resize" },
  { key: "br", x: "rightPct", y: "bottomPct", cursor: "nwse-resize" },
];

/** Projects a source-image-space box through a fit into a percentage rect of the canvas. */
export function boxToPercentRect(
  box: BoundingBox,
  fit: { scale: number; offsetX: number; offsetY: number },
  canvasWidth: number,
  canvasHeight: number
): HandleRectPercent {
  const left = fit.offsetX + box.x * fit.scale;
  const top = fit.offsetY + box.y * fit.scale;
  const right = fit.offsetX + (box.x + box.width) * fit.scale;
  const bottom = fit.offsetY + (box.y + box.height) * fit.scale;
  return {
    leftPct: (left / canvasWidth) * 100,
    topPct: (top / canvasHeight) * 100,
    rightPct: (right / canvasWidth) * 100,
    bottomPct: (bottom / canvasHeight) * 100,
  };
}

/**
 * Applies a crop-handle drag (in source pixels) to the box it started from:
 * "move" translates it, a corner moves the two edges that meet there.
 * The caller clamps the result to the image.
 */
export function dragCropBox(
  startBox: BoundingBox,
  mode: "move" | CornerKey,
  deltaX: number,
  deltaY: number
): BoundingBox {
  const next = { ...startBox };
  if (mode === "move") {
    next.x += deltaX;
    next.y += deltaY;
    return next;
  }
  if (mode.includes("l")) {
    next.x += deltaX;
    next.width -= deltaX;
  }
  if (mode.includes("r")) next.width += deltaX;
  if (mode.includes("t")) {
    next.y += deltaY;
    next.height -= deltaY;
  }
  if (mode.includes("b")) next.height += deltaY;
  return next;
}

/** Ratio between a canvas's pixel size and its on-screen (CSS) size, or null if it is not laid out. */
export function canvasPixelsPerCssPixel(canvas: HTMLCanvasElement): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return { x: canvas.width / rect.width, y: canvas.height / rect.height };
}
