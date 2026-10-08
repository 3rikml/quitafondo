import { describe, it, expect } from "vitest";
import { decontaminateEdges, featherAlpha, refineCutout, shiftEdge } from "../edgeRefine";
import type { PixelBuffer } from "../pixelBuffer";

/** A width x 1 alpha row. */
const row = (values: number[]) => new Uint8ClampedArray(values);

describe("shiftEdge", () => {
  it("grows the opaque region when shifting out", () => {
    expect(Array.from(shiftEdge(row([0, 0, 255, 0, 0]), 5, 1, 1))).toEqual([0, 255, 255, 255, 0]);
  });

  it("shrinks it when shifting in", () => {
    expect(Array.from(shiftEdge(row([0, 255, 255, 255, 0]), 5, 1, -1))).toEqual([0, 0, 255, 0, 0]);
  });

  it("is a no-op at 0", () => {
    const alpha = row([0, 255]);
    expect(shiftEdge(alpha, 2, 1, 0)).toBe(alpha);
  });
});

describe("featherAlpha", () => {
  it("turns a hard edge into a ramp and keeps flat areas flat", () => {
    const result = Array.from(featherAlpha(row([0, 0, 0, 255, 255, 255]), 6, 1, 1));
    expect(result[0]).toBe(0);
    expect(result[5]).toBe(255);
    expect(result[2]).toBeGreaterThan(0);
    expect(result[2]).toBeLessThan(255);
    expect(result[3]).toBeGreaterThan(result[2]);
  });
});

/** Builds a square image: left half pure green background, right half red subject, one mixed column between. */
function scene(size: number): { cutout: PixelBuffer; original: PixelBuffer } {
  const original = new Uint8ClampedArray(size * size * 4);
  const cutout = new Uint8ClampedArray(size * size * 4);
  const edgeX = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // 50% mix of red subject over green background on the edge column.
      const [r, g, b, a] = x < edgeX ? [0, 255, 0, 0] : x === edgeX ? [128, 128, 0, 128] : [255, 0, 0, 255];
      original.set([r, g, b, 255], i);
      cutout.set([r, g, b, a], i);
    }
  }
  return { cutout: { width: size, height: size, data: cutout }, original: { width: size, height: size, data: original } };
}

describe("decontaminateEdges", () => {
  it("removes the background color from a semi-transparent edge pixel", () => {
    const { cutout, original } = scene(32);
    const result = decontaminateEdges(cutout, original);
    const i = (16 * 32 + 16) * 4;
    // Observed 50/50 red-green mix -> recovered subject color is red, not olive.
    expect(result.data[i]).toBeGreaterThan(240);
    expect(result.data[i + 1]).toBeLessThan(15);
    expect(result.data[i + 3]).toBe(128); // alpha untouched
  });

  it("leaves fully opaque and fully transparent pixels alone", () => {
    const { cutout, original } = scene(32);
    const result = decontaminateEdges(cutout, original);
    const opaque = (16 * 32 + 25) * 4;
    expect(Array.from(result.data.slice(opaque, opaque + 4))).toEqual([255, 0, 0, 255]);
  });
});

describe("refineCutout", () => {
  it("returns the same buffer when every setting is off", () => {
    const { cutout, original } = scene(8);
    expect(refineCutout(cutout, original, { feather: 0, shift: 0, decontaminate: false })).toBe(cutout);
  });
});
