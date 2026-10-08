import { describe, it, expect } from "vitest";
import { boxToPercentRect, dragCropBox } from "../handles";

describe("boxToPercentRect", () => {
  it("projects a source box through the fit into canvas percentages", () => {
    const rect = boxToPercentRect({ x: 10, y: 20, width: 30, height: 40 }, { scale: 2, offsetX: 5, offsetY: 0 }, 200, 100);
    expect(rect).toEqual({ leftPct: 12.5, topPct: 40, rightPct: 42.5, bottomPct: 120 });
  });
});

describe("dragCropBox", () => {
  const box = { x: 10, y: 10, width: 100, height: 50 };

  it("translates the whole box when dragging its body", () => {
    expect(dragCropBox(box, "move", 5, -3)).toEqual({ x: 15, y: 7, width: 100, height: 50 });
  });

  it("moves the left and top edges for the top-left handle", () => {
    expect(dragCropBox(box, "tl", 10, 5)).toEqual({ x: 20, y: 15, width: 90, height: 45 });
  });

  it("grows width and height for the bottom-right handle", () => {
    expect(dragCropBox(box, "br", 10, 5)).toEqual({ x: 10, y: 10, width: 110, height: 55 });
  });

  it("never mutates the starting box", () => {
    dragCropBox(box, "tr", 7, 7);
    expect(box).toEqual({ x: 10, y: 10, width: 100, height: 50 });
  });
});
