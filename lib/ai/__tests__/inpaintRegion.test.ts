import { describe, it, expect } from "vitest";
import {
  INPAINT_SIZE,
  fromOutputTensor,
  inpaintRegion,
  maskBounds,
  toImageTensor,
  toMaskTensor,
  withAlphaOf,
} from "../inpaintRegion";

describe("maskBounds", () => {
  it("finds the box around the painted pixels", () => {
    const mask = new Uint8Array(5 * 4);
    mask[1 * 5 + 1] = 255;
    mask[2 * 5 + 3] = 255;
    expect(maskBounds(mask, 5, 4)).toEqual({ x: 1, y: 1, width: 3, height: 2 });
  });

  it("is null when nothing is painted", () => {
    expect(maskBounds(new Uint8Array(9), 3, 3)).toBeNull();
  });
});

describe("inpaintRegion", () => {
  it("is at least 512 px, centered on the painted area, inside the image", () => {
    const region = inpaintRegion({ x: 1000, y: 800, width: 40, height: 40 }, 3000, 2000);
    expect(region).toEqual({ x: 764, y: 564, width: 512, height: 512 });
  });

  it("includes as much context again as the painted area", () => {
    const region = inpaintRegion({ x: 100, y: 100, width: 600, height: 300 }, 4000, 3000);
    expect(region.width).toBe(1200);
    expect(region.height).toBe(1200);
  });

  it("is shifted inside the image near an edge", () => {
    const region = inpaintRegion({ x: 0, y: 0, width: 50, height: 50 }, 2000, 2000);
    expect(region.x).toBe(0);
    expect(region.y).toBe(0);
  });

  it("covers the whole dimension of a photo smaller than 512 px", () => {
    const region = inpaintRegion({ x: 10, y: 10, width: 20, height: 20 }, 300, 900);
    expect(region.width).toBe(300);
    expect(region.x).toBe(0);
    expect(region.height).toBe(512);
  });
});

describe("tensors", () => {
  const size = INPAINT_SIZE * INPAINT_SIZE;

  it("converts RGBA to planar 0..1 floats", () => {
    const rgba = new Uint8ClampedArray(size * 4);
    rgba.set([255, 51, 0, 255], 0);
    const t = toImageTensor(rgba);
    expect(t[0]).toBe(1);
    expect(t[size]).toBeCloseTo(0.2, 6);
    expect(t[2 * size]).toBe(0);
  });

  it("binarizes the mask", () => {
    const alpha = new Uint8ClampedArray(size);
    alpha[0] = 200;
    alpha[1] = 50;
    const t = toMaskTensor(alpha);
    expect([t[0], t[1]]).toEqual([1, 0]);
  });

  it("converts the planar 0..255 output back to RGBA with the given alpha", () => {
    const output = new Float32Array(3 * size);
    output[0] = 10.4;
    output[size] = 20;
    output[2 * size] = 300; // clamped
    const alpha = new Uint8ClampedArray(size).fill(128);
    expect(Array.from(fromOutputTensor(output, alpha).slice(0, 4))).toEqual([10, 20, 255, 128]);
  });
});

describe("withAlphaOf", () => {
  it("keeps the new colors and the old alpha", () => {
    const rgb = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
    const cutout = new Uint8ClampedArray([9, 9, 9, 0, 9, 9, 9, 200]);
    expect(Array.from(withAlphaOf(rgb, cutout))).toEqual([1, 2, 3, 0, 4, 5, 6, 200]);
  });
});
