import { describe, it, expect } from "vitest";
import { applyMaskToOverrides, rankMasks } from "../samMask";
import { NO_OVERRIDE, createOverrideBuffer } from "@/lib/image/alphaCompose";

describe("rankMasks", () => {
  // 3 candidates of a 3x1 image with areas 2, 1 and 3.
  const candidates = [1, 1, 0, /**/ 0, 0, 1, /**/ 1, 1, 1];

  it("sorts candidates from smallest to largest as 0/255 masks", () => {
    const { masks } = rankMasks(candidates, 3, 3, 1, [0.1, 0.2, 0.3]);
    expect(masks.map((m) => Array.from(m))).toEqual([
      [0, 0, 255],
      [255, 255, 0],
      [255, 255, 255],
    ]);
  });

  it("points `best` at the highest-scoring candidate after sorting", () => {
    expect(rankMasks(candidates, 3, 3, 1, [0.9, 0.2, 0.3]).best).toBe(1); // the area-2 mask
    expect(rankMasks(candidates, 3, 3, 1, [0.1, 0.8, 0.3]).best).toBe(0); // the area-1 mask
  });

  it("drops empty candidates", () => {
    const { masks, best } = rankMasks([0, 0, 1, 0], 2, 2, 1, [0.99, 0.5]);
    expect(masks).toHaveLength(1);
    expect(best).toBe(0);
  });
});

describe("applyMaskToOverrides", () => {
  it("forces the masked pixels visible when adding and leaves the rest untouched", () => {
    const overrides = createOverrideBuffer(3);
    overrides[2] = 0;
    const changed = applyMaskToOverrides(overrides, Uint8Array.from([255, 0, 0]), true);
    expect(changed).toBe(1);
    expect(Array.from(overrides)).toEqual([255, NO_OVERRIDE, 0]);
  });

  it("hides the masked pixels when removing", () => {
    const overrides = createOverrideBuffer(2);
    applyMaskToOverrides(overrides, Uint8Array.from([255, 255]), false);
    expect(Array.from(overrides)).toEqual([0, 0]);
  });
});
