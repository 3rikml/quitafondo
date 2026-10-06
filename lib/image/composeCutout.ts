import { composeFinalAlpha, createOverrideBuffer } from "./alphaCompose";
import { substituteRestoredRgb } from "./restoreRgb";
import type { PixelBuffer } from "./pixelBuffer";

/**
 * Applies manual retouch overrides (erase/restore strokes) to a decoded
 * cutout: forces alpha at overridden pixels and, for pixels restored where
 * the model had fully erased them, repairs their RGB from the pre-removal
 * original photo (see `restoreRgb.ts` for why that's necessary). With no
 * overrides, or an original whose dimensions don't match, returns the cutout
 * untouched beyond a defensive copy.
 */
export function composeCutoutWithRetouch(
  sourcePixels: PixelBuffer,
  originalPixels: PixelBuffer | null,
  overrideAlpha: Int16Array | null
): PixelBuffer {
  const overrides = overrideAlpha ?? createOverrideBuffer(sourcePixels.width * sourcePixels.height);
  const modelAlpha = new Uint8ClampedArray(sourcePixels.width * sourcePixels.height);
  for (let i = 0; i < modelAlpha.length; i++) {
    modelAlpha[i] = sourcePixels.data[i * 4 + 3];
  }
  const finalAlpha = composeFinalAlpha(modelAlpha, overrides);

  const data = new Uint8ClampedArray(sourcePixels.data.length);
  data.set(sourcePixels.data);
  for (let i = 0; i < finalAlpha.length; i++) {
    data[i * 4 + 3] = finalAlpha[i];
  }
  const composed = { width: sourcePixels.width, height: sourcePixels.height, data };

  if (!originalPixels) return composed;
  if (originalPixels.width !== composed.width || originalPixels.height !== composed.height) {
    return composed;
  }

  return substituteRestoredRgb(composed, originalPixels, modelAlpha, overrides);
}
