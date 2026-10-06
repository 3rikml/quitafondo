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
