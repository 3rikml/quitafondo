import { describe, it, expect } from "vitest";
import { defaultGhostBand, removeTranslucentGhosts } from "../ghostCleanup";

const W = 200;
const H = 120;

function image(fill: (x: number, y: number) => number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba[(y * W + x) * 4 + 3] = fill(x, y);
  return rgba;
}
const alphaAt = (rgba: Uint8ClampedArray, x: number, y: number) => rgba[(y * W + x) * 4 + 3];

describe("removeTranslucentGhosts", () => {
  it("removes a translucent patch far from the subject but keeps the soft edge beside it", () => {
    // Solid block on the left, a soft 3 px edge, and a faint patch on the far right.
    const rgba = image((x, y) => (x < 60 ? 255 : x < 63 ? 120 : x > 150 && x < 190 && y > 30 && y < 90 ? 70 : 0));
    removeTranslucentGhosts(rgba, W, H, 8);
    expect(alphaAt(rgba, 61, 50)).toBe(120); // edge kept
    expect(alphaAt(rgba, 170, 60)).toBe(0); // ghost gone
    expect(alphaAt(rgba, 20, 60)).toBe(255); // subject untouched
  });

  it("keeps translucent hair strands within the band", () => {
    const rgba = image((x) => (x < 60 ? 255 : x < 66 ? 90 : 0));
    removeTranslucentGhosts(rgba, W, H, 8);
    expect(alphaAt(rgba, 64, 50)).toBe(90);
  });

  it("does nothing when the whole cutout is translucent (glass, veils)", () => {
    const rgba = image((x, y) => (x > 40 && x < 160 && y > 20 && y < 100 ? 90 : 0));
    const before = Array.from(rgba);
    removeTranslucentGhosts(rgba, W, H, 8);
    expect(Array.from(rgba)).toEqual(before);
  });

  it("never changes colors or solid pixels", () => {
    const rgba = image((x) => (x < 80 ? 255 : x > 120 ? 60 : 0));
    for (let i = 0; i < W * H; i++) rgba[i * 4] = 77;
    removeTranslucentGhosts(rgba, W, H, 8);
    for (let i = 0; i < W * H; i++) expect(rgba[i * 4]).toBe(77);
    expect(alphaAt(rgba, 10, 10)).toBe(255);
  });

  it("scales the band with the photo size", () => {
    expect(defaultGhostBand(640, 480)).toBe(8);
    expect(defaultGhostBand(4096, 3000)).toBe(46);
  });
});
