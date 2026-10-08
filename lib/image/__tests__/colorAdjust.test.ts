import { describe, it, expect } from "vitest";
import { NEUTRAL_ADJUST, applyAdjustments, buildAdjustLut } from "../colorAdjust";
import type { PixelBuffer } from "../pixelBuffer";

const pixel = (r: number, g: number, b: number, a = 255): PixelBuffer => ({
  width: 1,
  height: 1,
  data: new Uint8ClampedArray([r, g, b, a]),
});

describe("buildAdjustLut", () => {
  it("is the identity when every adjustment is 0", () => {
    const [r, g, b] = buildAdjustLut(NEUTRAL_ADJUST);
    for (let v = 0; v < 256; v += 51) {
      expect([r[v], g[v], b[v]]).toEqual([v, v, v]);
    }
  });

  it("raises contrast around mid-gray", () => {
    const [, g] = buildAdjustLut({ ...NEUTRAL_ADJUST, contrast: 50 });
    expect(g[200]).toBeGreaterThan(200);
    expect(g[50]).toBeLessThan(50);
  });
});

describe("applyAdjustments", () => {
  it("returns the same buffer when nothing is adjusted", () => {
    const input = pixel(10, 20, 30);
    expect(applyAdjustments(input, NEUTRAL_ADJUST)).toBe(input);
  });

  it("brightens without touching alpha", () => {
    const out = applyAdjustments(pixel(100, 100, 100, 180), { ...NEUTRAL_ADJUST, brightness: 50 });
    expect(out.data[0]).toBeGreaterThan(100);
    expect(out.data[3]).toBe(180);
  });

  it("warms by lifting red and lowering blue", () => {
    const out = applyAdjustments(pixel(128, 128, 128), { ...NEUTRAL_ADJUST, temperature: 60 });
    expect(out.data[0]).toBeGreaterThan(128);
    expect(out.data[1]).toBe(128);
    expect(out.data[2]).toBeLessThan(128);
  });

  it("fully desaturates at -100", () => {
    const out = applyAdjustments(pixel(200, 50, 50), { ...NEUTRAL_ADJUST, saturation: -100 });
    expect(out.data[0]).toBe(out.data[1]);
    expect(out.data[1]).toBe(out.data[2]);
  });

  it("skips fully transparent pixels", () => {
    const out = applyAdjustments(pixel(100, 100, 100, 0), { ...NEUTRAL_ADJUST, brightness: 80 });
    expect(Array.from(out.data)).toEqual([100, 100, 100, 0]);
  });
});
