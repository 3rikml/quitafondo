/** LaMa's fixed input size. */
export const INPAINT_SIZE = 512;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bounding box of the painted (non-zero) mask pixels, or null if nothing is painted. */
export function maskBounds(mask: ArrayLike<number>, width: number, height: number): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * The square region of the photo LaMa should see: the painted area plus as
 * much surrounding context again (the model fills holes from what is around
 * them), at least INPAINT_SIZE so small objects are processed at full
 * detail, and clamped to the image. On photos smaller than that in one
 * dimension the region is simply the whole extent of that dimension.
 */
export function inpaintRegion(bounds: Rect, width: number, height: number): Rect {
  const side = Math.max(INPAINT_SIZE, Math.ceil(Math.max(bounds.width, bounds.height) * 2));
  const regionWidth = Math.min(side, width);
  const regionHeight = Math.min(side, height);
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  const x = Math.round(Math.min(Math.max(0, centerX - regionWidth / 2), width - regionWidth));
  const y = Math.round(Math.min(Math.max(0, centerY - regionHeight / 2), height - regionHeight));
  return { x, y, width: regionWidth, height: regionHeight };
}

/** RGBA pixels (already resized to INPAINT_SIZE²) to LaMa's planar float input in 0..1. */
export function toImageTensor(rgba: ArrayLike<number>): Float32Array {
  const size = INPAINT_SIZE * INPAINT_SIZE;
  const out = new Float32Array(3 * size);
  for (let i = 0; i < size; i++) {
    out[i] = rgba[i * 4] / 255;
    out[size + i] = rgba[i * 4 + 1] / 255;
    out[2 * size + i] = rgba[i * 4 + 2] / 255;
  }
  return out;
}

/** Mask alpha (resized to INPAINT_SIZE²) to LaMa's 0/1 mask input. */
export function toMaskTensor(alpha: ArrayLike<number>): Float32Array {
  const out = new Float32Array(INPAINT_SIZE * INPAINT_SIZE);
  for (let i = 0; i < out.length; i++) out[i] = alpha[i] > 127 ? 1 : 0;
  return out;
}

/** LaMa's planar 0..255 output to RGBA, with alpha taken from `alpha` (the feathered mask). */
export function fromOutputTensor(output: ArrayLike<number>, alpha: ArrayLike<number>): Uint8ClampedArray {
  const size = INPAINT_SIZE * INPAINT_SIZE;
  const out = new Uint8ClampedArray(size * 4);
  for (let i = 0; i < size; i++) {
    out[i * 4] = output[i];
    out[i * 4 + 1] = output[size + i];
    out[i * 4 + 2] = output[2 * size + i];
    out[i * 4 + 3] = alpha[i];
  }
  return out;
}

/** RGB from `rgb`, alpha from `alphaSource` (same size): the cleaned photo with the existing cutout's alpha. */
export function withAlphaOf(rgb: Uint8ClampedArray, alphaSource: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgb);
  for (let i = 3; i < out.length; i += 4) out[i] = alphaSource[i];
  return out;
}
