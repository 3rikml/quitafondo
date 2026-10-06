import type { PixelBuffer } from "./pixelBuffer";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function computeAlphaBoundingBox(
  pixels: PixelBuffer,
  alphaThreshold = 0
): BoundingBox | null {
  let minX = pixels.width;
  let minY = pixels.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < pixels.height; y++) {
    for (let x = 0; x < pixels.width; x++) {
      const alpha = pixels.data[(y * pixels.width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX === -1) return null;

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Smallest a crop box's width/height may shrink to while being dragged. */
export const MIN_CROP_SIZE = 8;

/**
 * Keeps a crop box fully inside the `maxWidth`x`maxHeight` source image and
 * no smaller than `MIN_CROP_SIZE` on either axis, after a drag has moved or
 * resized it. Width/height are clamped first (so a corner drag can't shrink
 * the box below the minimum or grow it past the image edge), then x/y are
 * clamped against the now-final size (so a move can't push the box off
 * either edge).
 */
export function clampCropBox(box: BoundingBox, maxWidth: number, maxHeight: number): BoundingBox {
  const width = Math.min(Math.max(box.width, MIN_CROP_SIZE), maxWidth);
  const height = Math.min(Math.max(box.height, MIN_CROP_SIZE), maxHeight);
  const x = Math.min(Math.max(box.x, 0), maxWidth - width);
  const y = Math.min(Math.max(box.y, 0), maxHeight - height);
  return { x, y, width, height };
}
