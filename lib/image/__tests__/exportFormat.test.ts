import { describe, it, expect } from "vitest";
import { requiresFlattening, flattenOnWhite } from "../exportFormat";
import { createPixelBuffer } from "../pixelBuffer";

describe("requiresFlattening", () => {
  it("is true only for jpg", () => {
    expect(requiresFlattening("jpg")).toBe(true);
    expect(requiresFlattening("png")).toBe(false);
    expect(requiresFlattening("webp")).toBe(false);
  });
});

describe("flattenOnWhite", () => {
  it("leaves fully opaque pixels unchanged", () => {
    const pixels = createPixelBuffer(1, 1);
    pixels.data.set([10, 20, 30, 255]);
    const flattened = flattenOnWhite(pixels);
    expect(Array.from(flattened.data)).toEqual([10, 20, 30, 255]);
  });

  it("blends fully transparent pixels to pure white", () => {
    const pixels = createPixelBuffer(1, 1);
    pixels.data.set([10, 20, 30, 0]);
    const flattened = flattenOnWhite(pixels);
    expect(Array.from(flattened.data)).toEqual([255, 255, 255, 255]);
  });

  it("blends half-transparent pixels proportionally toward white", () => {
    const pixels = createPixelBuffer(1, 1);
    pixels.data.set([0, 0, 0, 128]); // ~50% alpha black
    const flattened = flattenOnWhite(pixels);
    // alpha/255 ~= 0.502; result ~= 0*0.502 + 255*0.498 ~= 127
    expect(flattened.data[0]).toBeGreaterThanOrEqual(126);
    expect(flattened.data[0]).toBeLessThanOrEqual(128);
    expect(flattened.data[3]).toBe(255);
  });
});
