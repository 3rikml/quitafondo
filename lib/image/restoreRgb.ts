import type { PixelBuffer } from "./pixelBuffer";

/**
 * Repairs the color of pixels brought back by a "Restaurar" stroke.
 *
 * The cutout is decoded through a 2D canvas, whose backing store is
 * premultiplied-alpha by spec: every browser zeroes the RGB of any pixel whose
 * alpha was exactly 0. So wherever the model itself erased a pixel
 * (`modelAlpha[i] === 0`), the cutout's RGB is garbage (usually black). Forcing
 * such a pixel back to alpha 255 therefore paints a black blob instead of the
 * subject's real color (hair, fingers...).
 *
 * For exactly those pixels — restored by hand (`overrideAlpha[i] === 255`) AND
 * erased by the model (`modelAlpha[i] === 0`) — the RGB is taken from the
 * pre-removal original photo, which is fully opaque and therefore survived the
 * same decode intact. Every other pixel keeps the cutout's own RGB, and the
 * alpha channel is never touched here (`composeFinalAlpha` owns it).
 *
 * `cutoutPixels` and `originalPixels` must have identical dimensions; when they
 * do not, `cutoutPixels` is returned unchanged (the caller has nothing reliable
 * to sample from).
 */
export function substituteRestoredRgb(
  cutoutPixels: PixelBuffer,
  originalPixels: PixelBuffer,
  modelAlpha: Uint8ClampedArray,
  overrideAlpha: Int16Array
): PixelBuffer {
  if (
    cutoutPixels.width !== originalPixels.width ||
    cutoutPixels.height !== originalPixels.height
  ) {
    return cutoutPixels;
  }

  const data = new Uint8ClampedArray(cutoutPixels.data.length);
  data.set(cutoutPixels.data);

  const pixelCount = cutoutPixels.width * cutoutPixels.height;
  for (let i = 0; i < pixelCount; i++) {
    // NO_OVERRIDE and erase strokes (0) both fall through untouched.
    if (overrideAlpha[i] !== 255) continue;
    if (modelAlpha[i] !== 0) continue;

    const offset = i * 4;
    data[offset] = originalPixels.data[offset];
    data[offset + 1] = originalPixels.data[offset + 1];
    data[offset + 2] = originalPixels.data[offset + 2];
  }

  return { width: cutoutPixels.width, height: cutoutPixels.height, data };
}
