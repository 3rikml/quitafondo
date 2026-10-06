import { describe, it, expect } from "vitest";
import { createPixelBuffer } from "../pixelBuffer";
import { clampCropBox, computeAlphaBoundingBox } from "../boundingBox";

function setAlpha(pixels: ReturnType<typeof createPixelBuffer>, x: number, y: number, a: number) {
  pixels.data[(y * pixels.width + x) * 4 + 3] = a;
}

describe("computeAlphaBoundingBox", () => {
  it("returns null when every pixel is fully transparent", () => {
    const pixels = createPixelBuffer(4, 4);
    expect(computeAlphaBoundingBox(pixels)).toBeNull();
  });

  it("finds the tight box around a single opaque pixel", () => {
    const pixels = createPixelBuffer(10, 10);
    setAlpha(pixels, 3, 4, 255);
    expect(computeAlphaBoundingBox(pixels)).toEqual({ x: 3, y: 4, width: 1, height: 1 });
  });

  it("finds the tight box around a rectangular opaque region", () => {
    const pixels = createPixelBuffer(10, 10);
    for (let y = 2; y <= 5; y++) {
      for (let x = 1; x <= 6; x++) {
        setAlpha(pixels, x, y, 200);
      }
    }
    expect(computeAlphaBoundingBox(pixels)).toEqual({ x: 1, y: 2, width: 6, height: 4 });
  });

  it("ignores pixels at or below the alpha threshold", () => {
    const pixels = createPixelBuffer(5, 5);
    setAlpha(pixels, 0, 0, 10);
    setAlpha(pixels, 2, 2, 250);
    expect(computeAlphaBoundingBox(pixels, 10)).toEqual({ x: 2, y: 2, width: 1, height: 1 });
  });
});

describe("clampCropBox", () => {
  it("leaves a box that's already fully inside the image untouched", () => {
    expect(clampCropBox({ x: 10, y: 10, width: 50, height: 50 }, 100, 100)).toEqual({
      x: 10,
      y: 10,
      width: 50,
      height: 50,
    });
  });

  it("pulls a box back inside the image when it overhangs the right/bottom edge", () => {
    expect(clampCropBox({ x: 80, y: 90, width: 50, height: 50 }, 100, 100)).toEqual({
      x: 50,
      y: 50,
      width: 50,
      height: 50,
    });
  });

  it("pulls a negative-origin box back to the top-left edge", () => {
    expect(clampCropBox({ x: -20, y: -5, width: 30, height: 30 }, 100, 100)).toEqual({
      x: 0,
      y: 0,
      width: 30,
      height: 30,
    });
  });

  it("never shrinks below MIN_CROP_SIZE even if the drag requested smaller", () => {
    const result = clampCropBox({ x: 10, y: 10, width: 2, height: 2 }, 100, 100);
    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
  });

  it("never grows past the image bounds even if the drag requested larger", () => {
    const result = clampCropBox({ x: 0, y: 0, width: 500, height: 500 }, 100, 100);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });
});
