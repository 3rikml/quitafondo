import { describe, it, expect } from "vitest";
import { createOverrideBuffer } from "../alphaCompose";
import { substituteRestoredRgb } from "../restoreRgb";
import type { PixelBuffer } from "../pixelBuffer";

/** Builds a 1-row buffer from `[r,g,b,a]` tuples. */
function buffer(pixels: number[][]): PixelBuffer {
  return {
    width: pixels.length,
    height: 1,
    data: new Uint8ClampedArray(pixels.flat()),
  };
}

describe("substituteRestoredRgb", () => {
  it("takes the original's RGB where the pixel was restored and the model had erased it", () => {
    // Pixel 0: model erased it (alpha 0) so the decode zeroed its RGB.
    const cutout = buffer([[0, 0, 0, 255]]);
    const original = buffer([[120, 80, 40, 255]]);
    const modelAlpha = new Uint8ClampedArray([0]);
    const overrides = createOverrideBuffer(1);
    overrides[0] = 255; // restored by hand

    const result = substituteRestoredRgb(cutout, original, modelAlpha, overrides);
    expect(Array.from(result.data)).toEqual([120, 80, 40, 255]);
  });

  it("keeps the cutout's own RGB where the pixel was restored but the model had kept it", () => {
    // The model's alpha was > 0, so the cutout RGB survived the decode and is
    // the correct color (this is the "undo my own erase stroke" case).
    const cutout = buffer([[10, 20, 30, 255]]);
    const original = buffer([[200, 200, 200, 255]]);
    const modelAlpha = new Uint8ClampedArray([180]);
    const overrides = createOverrideBuffer(1);
    overrides[0] = 255;

    const result = substituteRestoredRgb(cutout, original, modelAlpha, overrides);
    expect(Array.from(result.data)).toEqual([10, 20, 30, 255]);
  });

  it("leaves pixels with no override entirely untouched", () => {
    const cutout = buffer([
      [0, 0, 0, 0],
      [5, 6, 7, 128],
    ]);
    const original = buffer([
      [90, 90, 90, 255],
      [91, 91, 91, 255],
    ]);
    const modelAlpha = new Uint8ClampedArray([0, 128]);
    const overrides = createOverrideBuffer(2); // all NO_OVERRIDE

    const result = substituteRestoredRgb(cutout, original, modelAlpha, overrides);
    expect(Array.from(result.data)).toEqual([0, 0, 0, 0, 5, 6, 7, 128]);
  });

  it("leaves erase strokes untouched even where the model had erased the pixel", () => {
    const cutout = buffer([[0, 0, 0, 0]]);
    const original = buffer([[90, 90, 90, 255]]);
    const modelAlpha = new Uint8ClampedArray([0]);
    const overrides = createOverrideBuffer(1);
    overrides[0] = 0; // erased by hand

    const result = substituteRestoredRgb(cutout, original, modelAlpha, overrides);
    expect(Array.from(result.data)).toEqual([0, 0, 0, 0]);
  });

  it("never rewrites the alpha channel — composeFinalAlpha owns it", () => {
    const cutout = buffer([[0, 0, 0, 255]]);
    const original = buffer([[7, 8, 9, 42]]);
    const modelAlpha = new Uint8ClampedArray([0]);
    const overrides = createOverrideBuffer(1);
    overrides[0] = 255;

    const result = substituteRestoredRgb(cutout, original, modelAlpha, overrides);
    expect(result.data[3]).toBe(255);
  });

  it("returns the cutout unchanged when the dimensions do not match", () => {
    const cutout = buffer([[0, 0, 0, 255]]);
    const original = buffer([
      [1, 2, 3, 255],
      [4, 5, 6, 255],
    ]);
    const modelAlpha = new Uint8ClampedArray([0]);
    const overrides = createOverrideBuffer(1);
    overrides[0] = 255;

    const result = substituteRestoredRgb(cutout, original, modelAlpha, overrides);
    expect(result).toBe(cutout);
  });

  it("does not mutate the input cutout buffer", () => {
    const cutout = buffer([[0, 0, 0, 255]]);
    const original = buffer([[120, 80, 40, 255]]);
    const modelAlpha = new Uint8ClampedArray([0]);
    const overrides = createOverrideBuffer(1);
    overrides[0] = 255;

    substituteRestoredRgb(cutout, original, modelAlpha, overrides);
    expect(Array.from(cutout.data)).toEqual([0, 0, 0, 255]);
  });
});
