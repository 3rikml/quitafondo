/**
 * Removes the translucent patches a segmentation model sometimes leaves on the
 * background (a cushion, a shadow, a wall stain it was unsure about).
 *
 * Real edges are only a few pixels thick, so alpha that is neither solid nor
 * within a short distance of a solid subject pixel is not an edge: it is
 * background the model half-kept. Those pixels are made transparent.
 *
 * Guard: when the cutout has almost no solid pixels (a glass bottle, a veil:
 * everything is translucent on purpose) nothing is removed.
 */

/** Alpha at or above this counts as a solid part of the subject. */
const SOLID = 128;
/** Share of the visible area that must be solid for the cleanup to run. */
const MIN_SOLID_SHARE = 0.25;
/** Below this alpha a pixel is not "visible" when measuring that share. */
const VISIBLE = 16;

/** How far (px) translucent alpha may extend from solid pixels: enough for hair and soft edges, scaled with the photo. */
export function defaultGhostBand(width: number, height: number): number {
  return Math.max(8, Math.round(Math.max(width, height) / 90));
}

/** Two-pass chamfer distance (in pixels, ×3 units) from every pixel to the nearest solid one. */
function distanceToSolid(alpha: Uint8ClampedArray, width: number, height: number): Uint16Array {
  const FAR = 0xffff;
  const dist = new Uint16Array(width * height);
  for (let i = 0; i < dist.length; i++) dist[i] = alpha[i] >= SOLID ? 0 : FAR;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let d = dist[i];
      if (d === 0) continue;
      if (x > 0) d = Math.min(d, dist[i - 1] + 3);
      if (y > 0) {
        d = Math.min(d, dist[i - width] + 3);
        if (x > 0) d = Math.min(d, dist[i - width - 1] + 4);
        if (x < width - 1) d = Math.min(d, dist[i - width + 1] + 4);
      }
      dist[i] = Math.min(d, FAR);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      let d = dist[i];
      if (d === 0) continue;
      if (x < width - 1) d = Math.min(d, dist[i + 1] + 3);
      if (y < height - 1) {
        d = Math.min(d, dist[i + width] + 3);
        if (x < width - 1) d = Math.min(d, dist[i + width + 1] + 4);
        if (x > 0) d = Math.min(d, dist[i + width - 1] + 4);
      }
      dist[i] = Math.min(d, FAR);
    }
  }
  return dist;
}

/** Cleans the alpha channel of `rgba` (width×height) in place. */
export function removeTranslucentGhosts(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  band: number = defaultGhostBand(width, height)
): void {
  const pixels = width * height;
  const alpha = new Uint8ClampedArray(pixels);
  let visible = 0;
  let solid = 0;
  for (let i = 0; i < pixels; i++) {
    const a = rgba[i * 4 + 3];
    alpha[i] = a;
    if (a >= VISIBLE) visible++;
    if (a >= SOLID) solid++;
  }
  if (visible === 0 || solid / visible < MIN_SOLID_SHARE) return;

  const dist = distanceToSolid(alpha, width, height);
  const limit = band * 3;
  for (let i = 0; i < pixels; i++) {
    if (alpha[i] > 0 && alpha[i] < SOLID && dist[i] > limit) rgba[i * 4 + 3] = 0;
  }
}
