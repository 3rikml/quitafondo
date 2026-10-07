import { describe, it, expect } from "vitest";
import { shadowGeometry } from "../drawSubject";
import { coverRect } from "../blur";

const box = { x: 100, y: 50, width: 200, height: 400 };

describe("shadowGeometry", () => {
  it("returns nothing when the shadow is off", () => {
    expect(shadowGeometry(box, { kind: "none", intensity: 80 })).toBeNull();
  });

  it("puts a contact shadow centered under the subject's bottom edge", () => {
    const geometry = shadowGeometry(box, { kind: "contact", intensity: 100 });
    expect(geometry).toMatchObject({ kind: "contact", centerX: 200, centerY: 450 });
    if (geometry?.kind !== "contact") throw new Error("expected a contact shadow");
    expect(geometry.radiusX).toBeLessThan(box.width / 2);
    expect(geometry.radiusY).toBeLessThan(geometry.radiusX);
  });

  it("scales opacity with intensity and clamps it to 0-100", () => {
    const half = shadowGeometry(box, { kind: "soft", intensity: 50 });
    const full = shadowGeometry(box, { kind: "soft", intensity: 100 });
    const over = shadowGeometry(box, { kind: "soft", intensity: 250 });
    expect(half!.opacity).toBeCloseTo(full!.opacity / 2, 5);
    expect(over!.opacity).toBe(full!.opacity);
  });

  it("drops a soft shadow slightly below the subject, proportional to its height", () => {
    const geometry = shadowGeometry(box, { kind: "soft", intensity: 50 });
    if (geometry?.kind !== "soft") throw new Error("expected a soft shadow");
    expect(geometry.offsetY).toBeGreaterThan(0);
    expect(geometry.offsetY).toBeLessThan(box.height * 0.1);
  });
});

describe("coverRect", () => {
  it("fills a wider target by matching its width and centering vertically", () => {
    expect(coverRect(100, 100, 400, 200)).toEqual({ x: 0, y: -100, width: 400, height: 400 });
  });

  it("fills a taller target by matching its height and centering horizontally", () => {
    expect(coverRect(200, 100, 100, 100)).toEqual({ x: -50, y: 0, width: 200, height: 100 });
  });
});
