import { describe, it, expect } from "vitest";
import { ZOOM_MAX, ZOOM_MIN, wheelZoomFactor, zoomAt } from "../viewport";

const screenOf = (view: { zoom: number; panX: number; panY: number }, cx: number, cy: number) => [
  view.panX + cx * view.zoom,
  view.panY + cy * view.zoom,
];

describe("zoomAt", () => {
  it("keeps the content under the pointer in place", () => {
    const view = { zoom: 1.5, panX: 40, panY: -20 };
    const pointer = [120, 80] as const;
    const content = [(pointer[0] - view.panX) / view.zoom, (pointer[1] - view.panY) / view.zoom];
    const next = zoomAt(view, 3, pointer[0], pointer[1]);
    const [x, y] = screenOf(next, content[0], content[1]);
    expect(x).toBeCloseTo(pointer[0], 6);
    expect(y).toBeCloseTo(pointer[1], 6);
  });

  it("zooming at the center leaves the pan alone", () => {
    expect(zoomAt({ zoom: 1, panX: 0, panY: 0 }, 2, 0, 0)).toEqual({ zoom: 2, panX: 0, panY: 0 });
  });

  it("clamps the zoom", () => {
    expect(zoomAt({ zoom: 1, panX: 0, panY: 0 }, 100, 0, 0).zoom).toBe(ZOOM_MAX);
    expect(zoomAt({ zoom: 1, panX: 0, panY: 0 }, 0.01, 0, 0).zoom).toBe(ZOOM_MIN);
  });
});

describe("wheelZoomFactor", () => {
  it("zooms in when scrolling up and out when scrolling down, symmetrically", () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(-100) * wheelZoomFactor(100)).toBeCloseTo(1, 10);
  });
});
