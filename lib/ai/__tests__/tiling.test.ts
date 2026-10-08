import { describe, it, expect } from "vitest";
import { computeTiles, pasteTile } from "../tiling";

describe("computeTiles", () => {
  it("uses a single tile, without margins, for an image smaller than one tile", () => {
    expect(computeTiles(100, 80, 256, 16)).toEqual([
      { x: 0, y: 0, width: 100, height: 80, keep: { x: 0, y: 0, width: 100, height: 80 } },
    ]);
  });

  it("keeps regions that cover every pixel exactly once", () => {
    const width = 700;
    const height = 530;
    const covered = new Uint8Array(width * height);
    for (const tile of computeTiles(width, height, 256, 16)) {
      for (let y = tile.keep.y; y < tile.keep.y + tile.keep.height; y++) {
        for (let x = tile.keep.x; x < tile.keep.x + tile.keep.width; x++) covered[y * width + x]++;
      }
    }
    expect(covered.every((count) => count === 1)).toBe(true);
  });

  it("uses one tile size everywhere, with an overlap margin on every inner edge", () => {
    for (const tile of computeTiles(700, 530, 256, 16)) {
      expect(tile.width).toBe(256);
      expect(tile.height).toBe(256);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.x + tile.width).toBeLessThanOrEqual(700);
      expect(tile.y + tile.height).toBeLessThanOrEqual(530);
      // The kept region sits inside the tile, with at least `overlap` real pixels around it.
      if (tile.keep.x > 0) expect(tile.keep.x - tile.x).toBeGreaterThanOrEqual(16);
      if (tile.keep.y > 0) expect(tile.keep.y - tile.y).toBeGreaterThanOrEqual(16);
      if (tile.keep.x + tile.keep.width < 700) expect(tile.x + tile.width - (tile.keep.x + tile.keep.width)).toBeGreaterThanOrEqual(16);
      expect(tile.keep.x).toBeGreaterThanOrEqual(tile.x);
      expect(tile.keep.x + tile.keep.width).toBeLessThanOrEqual(tile.x + tile.width);
    }
  });
});

describe("pasteTile", () => {
  it("copies only the kept center of a 2x RGB tile into the RGBA output", () => {
    // 2x2 input tile at (0,0) whose kept region is its bottom-right pixel (1,1).
    const tile = { x: 0, y: 0, width: 2, height: 2, keep: { x: 1, y: 1, width: 1, height: 1 } };
    // 4x4 RGB model output; value = row * 10 + col in every channel.
    const tileData = Array.from({ length: 4 * 4 * 3 }, (_, i) => {
      const pixel = Math.floor(i / 3);
      return Math.floor(pixel / 4) * 10 + (pixel % 4);
    });
    const output = new Uint8ClampedArray(4 * 4 * 4);
    pasteTile(output, 4, tile, tileData, 4, 3, 2);

    const at = (x: number, y: number) => Array.from(output.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4));
    expect(at(2, 2)).toEqual([22, 22, 22, 255]);
    expect(at(3, 3)).toEqual([33, 33, 33, 255]);
    expect(at(1, 1)).toEqual([0, 0, 0, 0]); // outside the kept region: untouched
  });
});
