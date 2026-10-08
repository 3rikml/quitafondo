import { describe, it, expect } from "vitest";
import {
  canvasPointToSource,
  computeCenteredFit, computeContainFit, getCropClipRect, resolveCanvasLayout } from "../canvasFit";
import type { CanvasConfig } from "../../types";

describe("computeCenteredFit", () => {
  it("centers a subject that already fills the source image, no margin", () => {
    // 100x100 source, subject fills it entirely, target canvas 200x200, 0% margin
    const result = computeCenteredFit(100, 100, { x: 0, y: 0, width: 100, height: 100 }, 200, 200, 0);
    expect(result.scale).toBeCloseTo(2, 5);
    expect(result.offsetX).toBeCloseTo(0, 5);
    expect(result.offsetY).toBeCloseTo(0, 5);
  });

  it("applies margin percent by shrinking the available area on each side", () => {
    // 100x100 source/subject, target 200x200, 10% margin per side -> available 160x160 -> scale 1.6
    const result = computeCenteredFit(100, 100, { x: 0, y: 0, width: 100, height: 100 }, 200, 200, 10);
    expect(result.scale).toBeCloseTo(1.6, 5);
    // subject center (50,50) * 1.6 = (80,80); canvas center (100,100); offset = 100-80 = 20
    expect(result.offsetX).toBeCloseTo(20, 5);
    expect(result.offsetY).toBeCloseTo(20, 5);
  });

  it("centers an off-center subject within a larger source image", () => {
    // 200x200 source, subject box at (150,150) size 50x50 (bottom-right corner), target 100x100, 0% margin
    const result = computeCenteredFit(200, 200, { x: 150, y: 150, width: 50, height: 50 }, 100, 100, 0);
    // scale to fit subject (50x50) into 100x100 available -> scale 2
    expect(result.scale).toBeCloseTo(2, 5);
    // subject center (175,175) * 2 = (350,350); canvas center (50,50); offset = 50-350 = -300
    expect(result.offsetX).toBeCloseTo(-300, 5);
    expect(result.offsetY).toBeCloseTo(-300, 5);
  });

  it("picks the smaller scale when subject aspect ratio differs from canvas", () => {
    // subject 100x50 (wide), target canvas 100x100, 0% margin -> limited by width -> scale 1
    const result = computeCenteredFit(100, 50, { x: 0, y: 0, width: 100, height: 50 }, 100, 100, 0);
    expect(result.scale).toBeCloseTo(1, 5);
  });

  it("clamps margin percent above 45 down to 45 to always leave positive area", () => {
    const result = computeCenteredFit(100, 100, { x: 0, y: 0, width: 100, height: 100 }, 200, 200, 90);
    // available = 200 * (1 - 2*45/100) = 200*0.1 = 20 -> scale 0.2
    expect(result.scale).toBeCloseTo(0.2, 5);
  });
});

describe("computeContainFit", () => {
  it("scales a large source down to fit entirely and centers it", () => {
    const result = computeContainFit(2000, 1000, 1080, 1080);
    expect(result.scale).toBeCloseTo(0.54, 5); // limited by width
    expect(result.offsetX).toBeCloseTo(0, 5);
    expect(result.offsetY).toBeCloseTo((1080 - 1000 * 0.54) / 2, 5);
  });

  it("scales a small source up to fit the canvas", () => {
    const result = computeContainFit(100, 100, 400, 200);
    expect(result.scale).toBeCloseTo(2, 5); // limited by height
    expect(result.offsetX).toBeCloseTo(100, 5);
    expect(result.offsetY).toBeCloseTo(0, 5);
  });
});

describe("resolveCanvasLayout", () => {
  const base: CanvasConfig = {
    preset: "original",
    widthPx: 0,
    heightPx: 0,
    centerSubject: false,
    marginPercent: 5,
    offsetX: 0,
    offsetY: 0,
    manualScale: 1,
    rotationDeg: 0,
    cropBox: null,
    shadow: { kind: "none", intensity: 50 },
    edge: { feather: 0, shift: 0, decontaminate: true },
  };

  it("uses the source size and an identity transform for the original preset", () => {
    const layout = resolveCanvasLayout(800, 600, { x: 10, y: 10, width: 100, height: 100 }, base);
    expect(layout).toEqual({
      width: 800,
      height: 600,
      fit: { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0, anchorX: 60, anchorY: 60 },
    });
  });

  it("fits the whole source into the preset canvas when centering is off (I4)", () => {
    const layout = resolveCanvasLayout(2000, 1000, null, {
      ...base,
      preset: "square",
      widthPx: 1080,
      heightPx: 1080,
    });
    expect(layout.width).toBe(1080);
    expect(layout.height).toBe(1080);
    // Must NOT be a 1:1 crop of the top-left corner.
    expect(layout.fit.scale).toBeCloseTo(0.54, 5);
    expect(layout.fit.offsetY).toBeGreaterThan(0);
  });

  it("centers the subject when centering is on", () => {
    const layout = resolveCanvasLayout(
      200,
      200,
      { x: 0, y: 0, width: 100, height: 100 },
      { ...base, preset: "square", widthPx: 200, heightPx: 200, centerSubject: true, marginPercent: 0 }
    );
    expect(layout.fit.scale).toBeCloseTo(2, 5);
    expect(layout.fit.offsetX).toBeCloseTo(0, 5);
  });

  it("falls back to the source size when a preset has no usable dimensions yet", () => {
    const layout = resolveCanvasLayout(640, 480, null, { ...base, preset: "custom" });
    expect(layout.width).toBe(640);
    expect(layout.height).toBe(480);
    expect(layout.fit.scale).toBe(1);
  });

  it("adds the manual offset on top of the automatic fit without changing scale", () => {
    const layout = resolveCanvasLayout(
      200,
      200,
      { x: 0, y: 0, width: 100, height: 100 },
      { ...base, preset: "square", widthPx: 200, heightPx: 200, centerSubject: true, marginPercent: 0, offsetX: 15, offsetY: -8 }
    );
    // Same centered fit as the "centers the subject" case (offsetX 0), plus the manual nudge.
    expect(layout.fit.scale).toBeCloseTo(2, 5);
    expect(layout.fit.offsetX).toBeCloseTo(15, 5);
    expect(layout.fit.offsetY).toBeCloseTo(-8, 5);
  });

  it("manualScale multiplies the fit's scale while anchoring on the subject's own center", () => {
    // Centered fit: 200x200 canvas, 100x100 subject at origin -> scale 2, offset (0,0).
    // Subject center in source coords is (50,50); on screen that's (0+50*2, 0+50*2) = (100,100).
    const layout = resolveCanvasLayout(
      200,
      200,
      { x: 0, y: 0, width: 100, height: 100 },
      { ...base, preset: "square", widthPx: 200, heightPx: 200, centerSubject: true, marginPercent: 0, manualScale: 1.5 }
    );
    expect(layout.fit.scale).toBeCloseTo(3, 5); // 2 * 1.5
    // The subject's on-screen center must stay at (100,100): offset + 50*3 = 100 -> offset = -50.
    expect(layout.fit.offsetX).toBeCloseTo(-50, 5);
    expect(layout.fit.offsetY).toBeCloseTo(-50, 5);
  });

  it("manualScale composes with a manual offset (offset is applied before the scale anchor)", () => {
    const layout = resolveCanvasLayout(
      200,
      200,
      { x: 0, y: 0, width: 100, height: 100 },
      {
        ...base,
        preset: "square",
        widthPx: 200,
        heightPx: 200,
        centerSubject: true,
        marginPercent: 0,
        offsetX: 20,
        offsetY: 0,
        manualScale: 2,
      }
    );
    // Base centered fit: scale 2, offset (0,0). Plus manual offset 20 -> on-screen
    // subject center = (0+20+50*2, 0+50*2) = (120, 100). Anchored there, scale
    // becomes 2*2=4, so new offset = 120 - 50*4 = -80.
    expect(layout.fit.scale).toBeCloseTo(4, 5);
    expect(layout.fit.offsetX).toBeCloseTo(-80, 5);
    expect(layout.fit.offsetY).toBeCloseTo(-100, 5);
  });

  describe("cropBox", () => {
    it("overrides the auto-detected subject box for centering", () => {
      // 200x200 source, auto bbox would be the off-center (150,150)/50x50 box,
      // but a crop at (0,0)/100x100 should win instead.
      const layout = resolveCanvasLayout(
        200,
        200,
        { x: 150, y: 150, width: 50, height: 50 },
        {
          ...base,
          preset: "square",
          widthPx: 200,
          heightPx: 200,
          centerSubject: true,
          marginPercent: 0,
          cropBox: { x: 0, y: 0, width: 100, height: 100 },
        }
      );
      expect(layout.fit.scale).toBeCloseTo(2, 5);
      expect(layout.fit.offsetX).toBeCloseTo(0, 5);
      expect(layout.fit.offsetY).toBeCloseTo(0, 5);
    });

    it("treats the crop's own size as the 'original' size when centering is off", () => {
      const layout = resolveCanvasLayout(800, 600, null, {
        ...base,
        cropBox: { x: 100, y: 50, width: 300, height: 200 },
      });
      expect(layout.width).toBe(300);
      expect(layout.height).toBe(200);
      // 1:1 scale, shifted so the crop's top-left lands at canvas (0,0).
      expect(layout.fit.scale).toBeCloseTo(1, 5);
      expect(layout.fit.offsetX).toBeCloseTo(-100, 5);
      expect(layout.fit.offsetY).toBeCloseTo(-50, 5);
    });

    it("fits the crop (not the whole image) into a preset canvas when centering is off", () => {
      const layout = resolveCanvasLayout(2000, 1000, null, {
        ...base,
        preset: "square",
        widthPx: 1080,
        heightPx: 1080,
        cropBox: { x: 500, y: 0, width: 1000, height: 1000 },
      });
      // Crop is already 1000x1000 -> scale 1.08 to fill the 1080 canvas.
      expect(layout.fit.scale).toBeCloseTo(1.08, 5);
      // Crop's top-left (500,0) must land at canvas (0,0).
      expect(layout.fit.offsetX).toBeCloseTo(-540, 5);
      expect(layout.fit.offsetY).toBeCloseTo(0, 5);
    });
  });

  describe("rotation", () => {
    it("adds rotationDeg (normalized) and an anchor at the subject's center to the fit", () => {
      const layout = resolveCanvasLayout(
        200,
        200,
        { x: 0, y: 0, width: 100, height: 100 },
        { ...base, preset: "square", widthPx: 200, heightPx: 200, centerSubject: true, marginPercent: 0, rotationDeg: 460 }
      );
      // 460 normalizes to 100.
      expect(layout.fit.rotationDeg).toBeCloseTo(100, 5);
      // Centered fit: scale 2, offset (0,0); subject center (50,50) -> anchor (100,100).
      expect(layout.fit.anchorX).toBeCloseTo(100, 5);
      expect(layout.fit.anchorY).toBeCloseTo(100, 5);
    });

    it("normalizes -200 to 160", () => {
      const layout = resolveCanvasLayout(800, 600, { x: 10, y: 10, width: 100, height: 100 }, { ...base, rotationDeg: -200 });
      expect(layout.fit.rotationDeg).toBeCloseTo(160, 5);
    });
  });
});

describe("getCropClipRect", () => {
  it("projects a source-space crop box through the fit into canvas pixels", () => {
    const rect = getCropClipRect(
      { scale: 2, offsetX: 10, offsetY: -5, rotationDeg: 0, anchorX: 0, anchorY: 0 },
      { x: 20, y: 30, width: 40, height: 50 }
    );
    expect(rect).toEqual({ x: 10 + 20 * 2, y: -5 + 30 * 2, width: 80, height: 100 });
  });
});

describe("canvasPointToSource", () => {
  const fit = { scale: 2, offsetX: 10, offsetY: 20, rotationDeg: 0, anchorX: 300, anchorY: 200 };

  it("undoes offset and scale, ignoring the anchor when there is no rotation", () => {
    expect(canvasPointToSource(110, 220, fit)).toEqual({ x: 50, y: 100 });
  });

  it("round-trips a source point through the same rotation drawSubject applies", () => {
    const rotated = { ...fit, rotationDeg: 90 };
    // Forward transform: scale + offset, then rotate 90° around the anchor.
    const source = { x: 40, y: 15 };
    const px = rotated.offsetX + source.x * rotated.scale;
    const py = rotated.offsetY + source.y * rotated.scale;
    const canvasX = rotated.anchorX - (py - rotated.anchorY);
    const canvasY = rotated.anchorY + (px - rotated.anchorX);
    const back = canvasPointToSource(canvasX, canvasY, rotated);
    expect(back.x).toBeCloseTo(source.x, 6);
    expect(back.y).toBeCloseTo(source.y, 6);
  });
});
