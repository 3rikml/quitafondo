/** Sentinel meaning "no manual retouch at this pixel, use the model's alpha". */
export const NO_OVERRIDE = -1;

export function createOverrideBuffer(length: number): Int16Array {
  const buffer = new Int16Array(length);
  buffer.fill(NO_OVERRIDE);
  return buffer;
}

/**
 * Combines the AI model's alpha channel with manual retouch overrides.
 * `overrideAlpha[i] === NO_OVERRIDE` keeps the model's value; any value
 * 0-255 forces the final alpha at that pixel (0 = erased by hand,
 * 255 = restored by hand). The sentinel now means only "untouched by the user";
 * "restore" no longer writes it, because reverting to the model's alpha would
 * be a no-op wherever the model already erased the subject.
 */
export function composeFinalAlpha(
  modelAlpha: Uint8ClampedArray,
  overrideAlpha: Int16Array
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(modelAlpha.length);
  for (let i = 0; i < modelAlpha.length; i++) {
    const override = overrideAlpha[i];
    result[i] = override === NO_OVERRIDE ? modelAlpha[i] : override;
  }
  return result;
}

/**
 * Retouch overrides painted on a `width`×`height` photo, carried over to the
 * same photo enlarged an integer `factor` times (each value fills a
 * factor×factor block), so "Mejorar calidad" keeps the strokes.
 */
export function upsampleOverrides(buffer: Int16Array, width: number, height: number, factor: number): Int16Array {
  const outWidth = width * factor;
  const out = new Int16Array(outWidth * height * factor);
  for (let y = 0; y < height * factor; y++) {
    const sourceRow = Math.floor(y / factor) * width;
    for (let x = 0; x < outWidth; x++) out[y * outWidth + x] = buffer[sourceRow + Math.floor(x / factor)];
  }
  return out;
}
