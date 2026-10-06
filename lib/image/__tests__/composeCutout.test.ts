import { describe, it, expect } from "vitest";
import { createOverrideBuffer } from "../alphaCompose";
import { composeCutoutWithRetouch } from "../composeCutout";
import type { PixelBuffer } from "../pixelBuffer";

/** Builds a 1-row buffer from `[r,g,b,a]` tuples. */
function buffer(pixels: number[][]): PixelBuffer {
  return {
    width: pixels.length,
    height: 1,
    data: new Uint8ClampedArray(pixels.flat()),
  };
}

describe("composeCutoutWithRetouch", () => {
  it("returns the cutout unchanged when there is no override buffer", () => {
    const cutout = buffer([[10, 20, 30, 180]]);
    const result = composeCutoutWithRetouch(cutout, null, null);
    expect(Array.from(result.data)).toEqual([10, 20, 30, 180]);
  });

  it("forces alpha to 0 where an erase stroke was painted", () => {
    const cutout = buffer([[10, 20, 30, 255]]);
    const overrides = createOverrideBuffer(1);
    overrides[0] = 0;

    const result = composeCutoutWithRetouch(cutout, null, overrides);
    expect(result.data[3]).toBe(0);
  });

  it("forces alpha to 255 and repairs RGB where a restore stroke recovers a model-erased pixel", () => {
    // Model fully erased the pixel (alpha 0 -> decode zeroed its RGB).
    const cutout = buffer([[0, 0, 0, 0]]);
    const original = buffer([[120, 80, 40, 255]]);
    const overrides = createOverrideBuffer(1);
    overrides[0] = 255;

    const result = composeCutoutWithRetouch(cutout, original, overrides);
    expect(Array.from(result.data)).toEqual([120, 80, 40, 255]);
  });

  it("skips color repair when the original's dimensions don't match the cutout", () => {
    const cutout = buffer([[0, 0, 0, 0]]);
    const original: PixelBuffer = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]),
    };
    const overrides = createOverrideBuffer(1);
    overrides[0] = 255;

    const result = composeCutoutWithRetouch(cutout, original, overrides);
    expect(Array.from(result.data)).toEqual([0, 0, 0, 255]);
  });

  it("leaves untouched pixels exactly as the model produced them", () => {
    const cutout = buffer([[5, 6, 7, 128]]);
    const overrides = createOverrideBuffer(1); // all NO_OVERRIDE
    const result = composeCutoutWithRetouch(cutout, null, overrides);
    expect(Array.from(result.data)).toEqual([5, 6, 7, 128]);
  });
});
