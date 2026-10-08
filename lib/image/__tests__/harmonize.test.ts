import { describe, it, expect } from "vitest";
import { meanColor, suggestHarmony } from "../harmonize";
import { NEUTRAL_ADJUST } from "../colorAdjust";

describe("meanColor", () => {
  it("averages only pixels opaque enough", () => {
    const pixels = {
      width: 3,
      height: 1,
      data: new Uint8ClampedArray([100, 0, 0, 255, 200, 0, 0, 255, 0, 0, 255, 0]),
    };
    expect(meanColor(pixels, 200)).toEqual({ r: 150, g: 0, b: 0 });
  });

  it("returns null when nothing qualifies", () => {
    expect(meanColor({ width: 1, height: 1, data: new Uint8ClampedArray([1, 2, 3, 0]) }, 1)).toBeNull();
  });
});

describe("suggestHarmony", () => {
  const gray = { r: 128, g: 128, b: 128 };

  it("changes nothing when subject and background already match", () => {
    expect(suggestHarmony(gray, gray, NEUTRAL_ADJUST)).toEqual(NEUTRAL_ADJUST);
  });

  it("brightens a subject placed on a much brighter background", () => {
    const result = suggestHarmony(gray, { r: 230, g: 230, b: 230 }, NEUTRAL_ADJUST);
    expect(result.brightness).toBeGreaterThan(0);
    expect(result.temperature).toBe(0);
  });

  it("warms a subject placed on a warm background, within the cap", () => {
    const result = suggestHarmony(gray, { r: 255, g: 140, b: 40 }, NEUTRAL_ADJUST);
    expect(result.temperature).toBeGreaterThan(0);
    expect(result.temperature).toBeLessThanOrEqual(30);
  });

  it("keeps the user's contrast and saturation", () => {
    const current = { ...NEUTRAL_ADJUST, contrast: 20, saturation: -10 };
    const result = suggestHarmony(gray, { r: 20, g: 20, b: 60 }, current);
    expect(result.contrast).toBe(20);
    expect(result.saturation).toBe(-10);
    expect(result.brightness).toBeLessThan(0);
  });
});
