import type { AdjustConfig } from "../types";
import type { PixelBuffer } from "./pixelBuffer";

export interface ColorStats {
  r: number;
  g: number;
  b: number;
}

const luminance = ({ r, g, b }: ColorStats) => 0.299 * r + 0.587 * g + 0.114 * b;
const warmth = ({ r, b }: ColorStats) => r - b;
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, Math.round(value)));

/**
 * Mean color of the pixels with at least `minAlpha` opacity (the subject in a
 * cutout, everything in an opaque background). Samples a grid of at most
 * ~20k pixels, so it stays instant on large photos. Null if none qualify.
 */
export function meanColor(pixels: PixelBuffer, minAlpha = 1): ColorStats | null {
  const total = pixels.width * pixels.height;
  const step = Math.max(1, Math.floor(total / 20000));
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (pixels.data[i + 3] < minAlpha) continue;
    r += pixels.data[i];
    g += pixels.data[i + 1];
    b += pixels.data[i + 2];
    count++;
  }
  return count === 0 ? null : { r: r / count, g: g / count, b: b / count };
}

/**
 * Suggests brightness and temperature that move the subject part of the way
 * toward the background's light and warmth, so a cutout shot under cool
 * office light does not look pasted onto a warm sunset. Deliberately subtle
 * (40% of the brightness gap, 35% of the warmth gap, both capped at ±30):
 * stronger shifts turned skin gray on blue backgrounds. Contrast and
 * saturation are kept.
 */
export function suggestHarmony(subject: ColorStats, background: ColorStats, current: AdjustConfig): AdjustConfig {
  // Slider units: brightness shifts 1.28 levels per step; temperature moves
  // red up and blue down by 0.3 each, i.e. warmth by 0.6 per step.
  const brightness = ((luminance(background) - luminance(subject)) * 0.4) / 1.28;
  const temperature = ((warmth(background) - warmth(subject)) * 0.35) / 0.6;
  return { ...current, brightness: clamp(brightness, 30), temperature: clamp(temperature, 30) };
}
