import { describe, it, expect } from "vitest";
import { paintBrushStroke, paintSmartBrushStroke, createSmartBrushScratch } from "../RetouchToolbar";
import { NO_OVERRIDE, createOverrideBuffer } from "@/lib/image/alphaCompose";
import type { PixelBuffer } from "@/lib/image/pixelBuffer";

const WIDTH = 40;
const HEIGHT = 40;

/** A square of `fillColor`, with a `patchColor` square inset at `(px, py)` sized `patchSize`. */
function buildPixels(fillColor: [number, number, number, number], patch?: {
  x: number;
  y: number;
  size: number;
  color: [number, number, number, number];
}): PixelBuffer {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    data.set(fillColor, i * 4);
  }
  if (patch) {
    for (let y = patch.y; y < patch.y + patch.size; y++) {
      for (let x = patch.x; x < patch.x + patch.size; x++) {
        data.set(patch.color, (y * WIDTH + x) * 4);
      }
    }
  }
  return { width: WIDTH, height: HEIGHT, data };
}

describe("paintBrushStroke — hardness", () => {
  it("hardness=1 reproduces the original hard-edged binary circle exactly", () => {
    const overrides = createOverrideBuffer(WIDTH * HEIGHT);
    paintBrushStroke(overrides, WIDTH, HEIGHT, 20, 20, 10, "erase", 1);

    // Center: fully inside the circle -> hard 0.
    expect(overrides[20 * WIDTH + 20]).toBe(0);
    // Just outside the radius: untouched.
    expect(overrides[20 * WIDTH + 31]).toBe(NO_OVERRIDE);
    // No pixel inside the circle should be anything other than the exact
    // target value — no partial/blended values at hardness=1.
    for (let y = 10; y <= 30; y++) {
      for (let x = 10; x <= 30; x++) {
        const dx = x - 20;
        const dy = y - 20;
        if (dx * dx + dy * dy <= 100) {
          expect(overrides[y * WIDTH + x]).toBe(0);
        }
      }
    }
  });

  it("hardness=0 produces a monotonic falloff from center to edge", () => {
    const overrides = createOverrideBuffer(WIDTH * HEIGHT);
    paintBrushStroke(overrides, WIDTH, HEIGHT, 20, 20, 10, "restore", 0);

    // Sample along a single ray from center outward; each step further out
    // should be less than or equal to the previous (restore fades from 255
    // at the center toward 0 at the rim).
    const samples = [0, 2, 4, 6, 8, 10].map((offset) => overrides[20 * WIDTH + (20 + offset)]);
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
    }
    expect(samples[0]).toBe(255); // dead center: full target
  });

  it("erase fades toward fully visible (255) at the rim, restore fades toward fully erased (0)", () => {
    const eraseOverrides = createOverrideBuffer(WIDTH * HEIGHT);
    paintBrushStroke(eraseOverrides, WIDTH, HEIGHT, 20, 20, 10, "erase", 0);
    // Pixel right at the edge of the circle should be close to the rim target (255), not 0.
    expect(eraseOverrides[20 * WIDTH + 29]).toBeGreaterThan(200);

    const restoreOverrides = createOverrideBuffer(WIDTH * HEIGHT);
    paintBrushStroke(restoreOverrides, WIDTH, HEIGHT, 20, 20, 10, "restore", 0);
    expect(restoreOverrides[20 * WIDTH + 29]).toBeLessThan(55);
  });

  it("clamps out-of-range hardness values instead of producing invalid output", () => {
    const overrides = createOverrideBuffer(WIDTH * HEIGHT);
    paintBrushStroke(overrides, WIDTH, HEIGHT, 20, 20, 5, "erase", 5); // > 1, clamps to 1
    expect(overrides[20 * WIDTH + 20]).toBe(0);

    const overrides2 = createOverrideBuffer(WIDTH * HEIGHT);
    paintBrushStroke(overrides2, WIDTH, HEIGHT, 20, 20, 5, "erase", -3); // < 0, clamps to 0
    expect(overrides2[20 * WIDTH + 20]).toBe(0); // dead center is still the full target either way
  });

  it("defaults to hardness=1 when the parameter is omitted", () => {
    const withDefault = createOverrideBuffer(WIDTH * HEIGHT);
    paintBrushStroke(withDefault, WIDTH, HEIGHT, 20, 20, 10, "erase");

    const explicitHard = createOverrideBuffer(WIDTH * HEIGHT);
    paintBrushStroke(explicitHard, WIDTH, HEIGHT, 20, 20, 10, "erase", 1);

    expect(Array.from(withDefault)).toEqual(Array.from(explicitHard));
  });
});
