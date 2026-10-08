import type { AdjustConfig } from "../types";
import type { PixelBuffer } from "./pixelBuffer";

export const NEUTRAL_ADJUST: AdjustConfig = { brightness: 0, contrast: 0, saturation: 0, temperature: 0 };

export function isNeutralAdjust(adjust: AdjustConfig): boolean {
  return adjust.brightness === 0 && adjust.contrast === 0 && adjust.saturation === 0 && adjust.temperature === 0;
}

const clamp = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : value);

/**
 * Per-channel lookup tables for brightness, contrast and temperature
 * (all -100..100). Brightness shifts by up to ±50% of the range; contrast
 * uses the classic `259(c+255) / 255(259-c)` curve around mid-gray;
 * temperature warms (+) by lifting red and lowering blue, or cools (-).
 */
export function buildAdjustLut(adjust: AdjustConfig): [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] {
  const brightness = adjust.brightness * 1.28;
  const c = adjust.contrast * 2.55;
  const contrastFactor = (259 * (c + 255)) / (255 * (259 - c));
  const warm = adjust.temperature * 0.3;
  const luts: [Uint8ClampedArray, Uint8ClampedArray, Uint8ClampedArray] = [
    new Uint8ClampedArray(256),
    new Uint8ClampedArray(256),
    new Uint8ClampedArray(256),
  ];
  for (let v = 0; v < 256; v++) {
    const base = contrastFactor * (v + brightness - 128) + 128;
    luts[0][v] = clamp(Math.round(base + warm));
    luts[1][v] = clamp(Math.round(base));
    luts[2][v] = clamp(Math.round(base - warm));
  }
  return luts;
}

/**
 * Applies the light/color adjustments to RGB only (alpha untouched). Returns
 * the input itself when every adjustment is 0, so callers can cheaply cache.
 */
export function applyAdjustments(pixels: PixelBuffer, adjust: AdjustConfig): PixelBuffer {
  if (isNeutralAdjust(adjust)) return pixels;
  const [lutR, lutG, lutB] = buildAdjustLut(adjust);
  const saturation = 1 + adjust.saturation / 100;
  const src = pixels.data;
  const data = new Uint8ClampedArray(src);
  for (let i = 0; i < data.length; i += 4) {
    if (src[i + 3] === 0) continue; // invisible: nothing to adjust
    let r = lutR[src[i]];
    let g = lutG[src[i + 1]];
    let b = lutB[src[i + 2]];
    if (saturation !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * saturation;
      g = gray + (g - gray) * saturation;
      b = gray + (b - gray) * saturation;
    }
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return { width: pixels.width, height: pixels.height, data };
}
