import type { EdgeConfig } from "../types";
import type { PixelBuffer } from "./pixelBuffer";

/**
 * Grows (`px > 0`) or shrinks (`px < 0`) the opaque region by `|px|` pixels:
 * a separable max (dilate) or min (erode) filter over a square window.
 */
export function shiftEdge(alpha: Uint8ClampedArray, width: number, height: number, px: number): Uint8ClampedArray {
  const radius = Math.round(Math.abs(px));
  if (radius === 0) return alpha;
  const pick = px > 0 ? Math.max : Math.min;
  const horizontal = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let value = alpha[row + x];
      for (let d = -radius; d <= radius; d++) {
        const nx = x + d;
        if (nx >= 0 && nx < width) value = pick(value, alpha[row + nx]);
      }
      horizontal[row + x] = value;
    }
  }
  const result = new Uint8ClampedArray(alpha.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let value = horizontal[y * width + x];
      for (let d = -radius; d <= radius; d++) {
        const ny = y + d;
        if (ny >= 0 && ny < height) value = pick(value, horizontal[ny * width + x]);
      }
      result[y * width + x] = value;
    }
  }
  return result;
}

/** Softens the alpha edge with a separable box blur of `radius` pixels (running sums, O(pixels)). */
export function featherAlpha(alpha: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const r = Math.round(radius);
  if (r <= 0) return alpha;
  const temp = new Float32Array(alpha.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    let count = 0;
    for (let x = 0; x <= Math.min(r, width - 1); x++) {
      sum += alpha[row + x];
      count++;
    }
    for (let x = 0; x < width; x++) {
      temp[row + x] = sum / count;
      const add = x + r + 1;
      const remove = x - r;
      if (add < width) {
        sum += alpha[row + add];
        count++;
      }
      if (remove >= 0) {
        sum -= alpha[row + remove];
        count--;
      }
    }
  }
  const result = new Uint8ClampedArray(alpha.length);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y <= Math.min(r, height - 1); y++) {
      sum += temp[y * width + x];
      count++;
    }
    for (let y = 0; y < height; y++) {
      result[y * width + x] = Math.round(sum / count);
      const add = y + r + 1;
      const remove = y - r;
      if (add < height) {
        sum += temp[add * width + x];
        count++;
      }
      if (remove >= 0) {
        sum -= temp[remove * width + x];
        count--;
      }
    }
  }
  return result;
}

/** Sample offsets around an edge pixel: 8 directions at 3 distances. */
const SAMPLE_OFFSETS: [number, number][] = [];
for (const distance of [3, 6, 10]) {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    SAMPLE_OFFSETS.push([dx * distance, dy * distance]);
  }
}
const BACKGROUND_ALPHA = 16;
const FOREGROUND_ALPHA = 240;

/**
 * Removes the color halo semi-transparent edge pixels carry from the old
 * background (e.g. a green fringe around hair shot against grass).
 *
 * Each edge pixel's observed color is I = a·F + (1-a)·B. B (local background)
 * and a fallback F (local subject color) are estimated by sampling nearby
 * pixels of the original photo that the model marked as clearly background or
 * clearly subject, then F = (I - (1-a)·B) / a. Only pixels with 0 < a < 255
 * are touched, so the cost is proportional to the edge length, not the image.
 */
export function decontaminateEdges(cutout: PixelBuffer, original: PixelBuffer): PixelBuffer {
  const { width, height } = cutout;
  if (original.width !== width || original.height !== height) return cutout;
  const data = new Uint8ClampedArray(cutout.data);
  const src = original.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a === 0 || a === 255) continue;

      let bR = 0, bG = 0, bB = 0, bN = 0;
      let fR = 0, fG = 0, fB = 0, fN = 0;
      for (const [dx, dy] of SAMPLE_OFFSETS) {
        const sx = x + dx;
        const sy = y + dy;
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
        const j = (sy * width + sx) * 4;
        const sampleAlpha = cutout.data[j + 3];
        if (sampleAlpha <= BACKGROUND_ALPHA) {
          bR += src[j]; bG += src[j + 1]; bB += src[j + 2]; bN++;
        } else if (sampleAlpha >= FOREGROUND_ALPHA) {
          fR += src[j]; fG += src[j + 1]; fB += src[j + 2]; fN++;
        }
      }
      if (bN === 0) continue; // no background nearby to subtract

      const alpha = a / 255;
      const solve = (observed: number, background: number) => (observed - (1 - alpha) * background) / alpha;
      let r = solve(src[i], bR / bN);
      let g = solve(src[i + 1], bG / bN);
      let b = solve(src[i + 2], bB / bN);
      // Faint pixels make the division unstable: lean on the nearby subject color.
      if (fN > 0 && alpha < 0.35) {
        const t = alpha / 0.35;
        r = r * t + (fR / fN) * (1 - t);
        g = g * t + (fG / fN) * (1 - t);
        b = b * t + (fB / fN) * (1 - t);
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }
  return { width, height, data };
}

/**
 * Applies the edge settings to the model's cutout: shift, then feather the
 * alpha, then remove color halos. Runs before manual retouch, which stays
 * exactly where the user painted it. Returns the input untouched when every
 * setting is off.
 */
export function refineCutout(cutout: PixelBuffer, original: PixelBuffer | null, edge: EdgeConfig): PixelBuffer {
  const { width, height } = cutout;
  let result = cutout;
  if (edge.shift !== 0 || edge.feather > 0) {
    let alpha: Uint8ClampedArray = new Uint8ClampedArray(width * height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = cutout.data[i * 4 + 3];
    alpha = featherAlpha(shiftEdge(alpha, width, height, edge.shift), width, height, edge.feather);
    const data = new Uint8ClampedArray(cutout.data);
    for (let i = 0; i < alpha.length; i++) data[i * 4 + 3] = alpha[i];
    result = { width, height, data };
  }
  if (edge.decontaminate && original) result = decontaminateEdges(result, original);
  return result;
}
