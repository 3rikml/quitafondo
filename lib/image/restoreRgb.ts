import type { PixelBuffer } from "./pixelBuffer";

/**
 * Below this model alpha the premultiplied decode has quantized the RGB too
 * coarsely to trust (at alpha 8 each channel is off by up to ±16 levels), not
 * just at exactly 0 — the half-transparent fringe of hair is where it shows.
 */
const MAX_DAMAGED_ALPHA = 32;

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
 * For exactly those pixels — restored by hand (`overrideAlpha[i]` above the model's alpha) AND
 * erased, or nearly so, by the model (`modelAlpha[i]` under `MAX_DAMAGED_ALPHA`) — the RGB is taken from the
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
    // NO_OVERRIDE and erase strokes both fall through untouched: only pixels
    // the user made MORE visible than the model had them need their color back.
    if (overrideAlpha[i] <= modelAlpha[i]) continue;
    if (modelAlpha[i] >= MAX_DAMAGED_ALPHA) continue;

    const offset = i * 4;
    data[offset] = originalPixels.data[offset];
    data[offset + 1] = originalPixels.data[offset + 1];
    data[offset + 2] = originalPixels.data[offset + 2];
  }

  return { width: cutoutPixels.width, height: cutoutPixels.height, data };
}
