import { describe, it, expect } from "vitest";
import { composeFinalAlpha, createOverrideBuffer, NO_OVERRIDE, upsampleOverrides } from "../alphaCompose";

describe("createOverrideBuffer", () => {
  it("fills a new buffer with NO_OVERRIDE for every pixel", () => {
    const buf = createOverrideBuffer(3);
    expect(Array.from(buf)).toEqual([NO_OVERRIDE, NO_OVERRIDE, NO_OVERRIDE]);
  });
});

describe("composeFinalAlpha", () => {
  it("uses the model alpha when there is no override", () => {
    const modelAlpha = new Uint8ClampedArray([0, 128, 255]);
    const overrides = createOverrideBuffer(3);
    const result = composeFinalAlpha(modelAlpha, overrides);
    expect(Array.from(result)).toEqual([0, 128, 255]);
  });

  it("uses the override value (e.g. 0 for an erase stroke) where present", () => {
    const modelAlpha = new Uint8ClampedArray([200, 200, 200]);
    const overrides = createOverrideBuffer(3);
    overrides[1] = 0; // erased
    const result = composeFinalAlpha(modelAlpha, overrides);
    expect(Array.from(result)).toEqual([200, 0, 200]);
  });

  it("uses a restore override (original alpha value) where present", () => {
    const modelAlpha = new Uint8ClampedArray([0, 0, 0]);
    const overrides = createOverrideBuffer(3);
    overrides[2] = 255; // restored to fully opaque
    const result = composeFinalAlpha(modelAlpha, overrides);
    expect(Array.from(result)).toEqual([0, 0, 255]);
  });
});

describe("upsampleOverrides", () => {
  it("fills a 2x2 block with each override", () => {
    const buf = Int16Array.from([1, NO_OVERRIDE, 255, 0]); // 2x2
    expect(Array.from(upsampleOverrides(buf, 2, 2, 2))).toEqual([
      1, 1, NO_OVERRIDE, NO_OVERRIDE,
      1, 1, NO_OVERRIDE, NO_OVERRIDE,
      255, 255, 0, 0,
      255, 255, 0, 0,
    ]);
  });
});
