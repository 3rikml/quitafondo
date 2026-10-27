import { describe, it, expect } from "vitest";
import { defaultMattingOptions, refineEdgeAlpha } from "../edgeMatting";

const SIZE = 256;
const SCALE = 4; // the "model" saw the photo 4x smaller
const OPTIONS = { radius: 8 };

/** A red disc with thin strands on a blue backdrop, plus the exact alpha. */
function makePhoto() {
  const truth = new Uint8ClampedArray(SIZE * SIZE);
  const rgba = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx = x - 128;
      const dy = y - 128;
      const inDisc = dx * dx + dy * dy <= 70 * 70;
      // Three thin diagonal "hairs" sticking out of the disc.
      const inStrand = [0, 1, 2].some((k) => Math.abs(x - 128 - (y - 40) * 0.2 - k * 18) < 1.2 && y > 20 && y < 70);
      const foreground = inDisc || inStrand;
      truth[y * SIZE + x] = foreground ? 255 : 0;
      const o = (y * SIZE + x) * 4;
      rgba[o] = foreground ? 208 : 74;
      rgba[o + 1] = foreground ? 2 : 144;
      rgba[o + 2] = foreground ? 27 : 217;
      rgba[o + 3] = 255;
    }
  }
  return { truth, rgba };
}

/** What a model at 1/SCALE resolution gives once enlarged: the truth, averaged in blocks, then smoothly resized. */
function blurryModelAlpha(truth: Uint8ClampedArray): Float32Array {
  const small = SIZE / SCALE;
  const low = new Float32Array(small * small);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) low[Math.floor(y / SCALE) * small + Math.floor(x / SCALE)] += truth[y * SIZE + x] / (SCALE * SCALE);
  const out = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const fx = Math.min(small - 1.001, Math.max(0, (x + 0.5) / SCALE - 0.5));
      const fy = Math.min(small - 1.001, Math.max(0, (y + 0.5) / SCALE - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      out[y * SIZE + x] =
        low[y0 * small + x0] * (1 - tx) * (1 - ty) +
        low[y0 * small + x0 + 1] * tx * (1 - ty) +
        low[(y0 + 1) * small + x0] * (1 - tx) * ty +
        low[(y0 + 1) * small + x0 + 1] * tx * ty;
    }
  }
  return out;
}

function meanError(rgba: Uint8ClampedArray, truth: Uint8ClampedArray): number {
  let total = 0;
  for (let i = 0; i < truth.length; i++) total += Math.abs(rgba[i * 4 + 3] - truth[i]);
  return total / truth.length;
}

function withAlpha(rgba: Uint8ClampedArray, alpha: Float32Array): Uint8ClampedArray {
  const copy = new Uint8ClampedArray(rgba);
  for (let i = 0; i < alpha.length; i++) copy[i * 4 + 3] = Math.round(alpha[i]);
  return copy;
}

describe("refineEdgeAlpha", () => {
  it("brings a blurry enlarged mask much closer to the true edge", () => {
    const { truth, rgba } = makePhoto();
    const blurry = withAlpha(rgba, blurryModelAlpha(truth));
    const before = meanError(blurry, truth);

    const refined = new Uint8ClampedArray(blurry);
    refineEdgeAlpha(refined, SIZE, SIZE, OPTIONS);
    const after = meanError(refined, truth);

    expect(after).toBeLessThan(before * 0.5);
  });

  it("leaves decided pixels away from the edge exactly as they were", () => {
    const { truth, rgba } = makePhoto();
    const blurry = withAlpha(rgba, blurryModelAlpha(truth));
    const refined = new Uint8ClampedArray(blurry);
    refineEdgeAlpha(refined, SIZE, SIZE, OPTIONS);

    for (const [x, y] of [[128, 128], [5, 5], [250, 250], [128, 190]]) {
      expect(refined[(y * SIZE + x) * 4 + 3]).toBe(blurry[(y * SIZE + x) * 4 + 3]);
    }
  });

  it("does not touch the colors, only alpha", () => {
    const { truth, rgba } = makePhoto();
    const blurry = withAlpha(rgba, blurryModelAlpha(truth));
    const refined = new Uint8ClampedArray(blurry);
    refineEdgeAlpha(refined, SIZE, SIZE, OPTIONS);
    for (let i = 0; i < SIZE * SIZE; i++) {
      expect(refined[i * 4]).toBe(blurry[i * 4]);
      expect(refined[i * 4 + 1]).toBe(blurry[i * 4 + 1]);
      expect(refined[i * 4 + 2]).toBe(blurry[i * 4 + 2]);
    }
  });

  it("keeps an already exact mask exact", () => {
    const { truth, rgba } = makePhoto();
    const exact = withAlpha(rgba, Float32Array.from(truth));
    const refined = new Uint8ClampedArray(exact);
    refineEdgeAlpha(refined, SIZE, SIZE, OPTIONS);
    expect(meanError(refined, truth)).toBe(0);
  });

  it("keeps the model's mask where subject and background look alike", () => {
    const { truth, rgba } = makePhoto();
    const gray = new Uint8ClampedArray(rgba);
    for (let i = 0; i < SIZE * SIZE; i++) gray.set([120, 120, 120], i * 4); // no color to go on
    const blurry = withAlpha(gray, blurryModelAlpha(truth));
    const refined = new Uint8ClampedArray(blurry);
    refineEdgeAlpha(refined, SIZE, SIZE, OPTIONS);
    expect(Array.from(refined)).toEqual(Array.from(blurry));
  });

  it("never lets the subject's own texture punch holes in it", () => {
    const { truth, rgba } = makePhoto();
    const textured = new Uint8ClampedArray(rgba);
    for (let i = 0; i < SIZE * SIZE; i++) if (truth[i] === 255 && i % 7 === 0) textured.set([20, 20, 20], i * 4);
    const blurry = withAlpha(textured, blurryModelAlpha(truth));
    const refined = new Uint8ClampedArray(blurry);
    refineEdgeAlpha(refined, SIZE, SIZE, OPTIONS);
    for (let i = 0; i < SIZE * SIZE; i++) {
      if (blurry[i * 4 + 3] === 255) expect(refined[i * 4 + 3]).toBe(255);
    }
  });

  it("works on images that are not a multiple of the tile size", () => {
    const width = 700;
    const height = 530;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const x = i % width;
      rgba[i * 4] = x < 350 ? 200 : 20;
      rgba[i * 4 + 2] = x < 350 ? 20 : 200;
      rgba[i * 4 + 3] = x < 340 ? 255 : x > 360 ? 0 : Math.round(255 - ((x - 340) / 20) * 255);
    }
    refineEdgeAlpha(rgba, width, height, { radius: 20 });
    // The ramp now sits on the colour edge at x = 350.
    expect(rgba[(100 * width + 346) * 4 + 3]).toBeGreaterThan(240);
    expect(rgba[(100 * width + 354) * 4 + 3]).toBeLessThan(15);
  });

  it("scales its search radius with how much the photo was enlarged", () => {
    expect(defaultMattingOptions(1024, 768).radius).toBe(5);
    expect(defaultMattingOptions(4096, 3000).radius).toBe(20);
    expect(defaultMattingOptions(200, 200).radius).toBeGreaterThanOrEqual(4);
  });
});
