import { describe, it, expect } from "vitest";
import { forEachDabAlong, type Point } from "../strokePath";

function collect(from: Point | null, to: Point, spacing: number): Point[] {
  const points: Point[] = [];
  forEachDabAlong(from, to, spacing, (p) => points.push(p));
  return points;
}

describe("forEachDabAlong", () => {
  it("dabs once at the start of a stroke", () => {
    expect(collect(null, { x: 5, y: 5 }, 10)).toEqual([{ x: 5, y: 5 }]);
  });

  it("fills a long segment with dabs no further apart than the spacing, ending on the target", () => {
    const points = collect({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
    expect(points).toHaveLength(10);
    expect(points[points.length - 1]).toEqual({ x: 100, y: 0 });
    for (let i = 1; i < points.length; i++) expect(points[i].x - points[i - 1].x).toBeLessThanOrEqual(10);
  });

  it("dabs once for a stationary pointer", () => {
    expect(collect({ x: 3, y: 3 }, { x: 3, y: 3 }, 10)).toEqual([{ x: 3, y: 3 }]);
  });

  it("caps the dabs of an enormous jump", () => {
    expect(collect({ x: 0, y: 0 }, { x: 1e6, y: 0 }, 1).length).toBeLessThanOrEqual(200);
  });
});
