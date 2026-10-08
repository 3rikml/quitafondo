import { describe, it, expect } from "vitest";
import { defaultBrushSize } from "../useRetouch";

describe("defaultBrushSize", () => {
  it("is 2% of the photo's longest side", () => {
    expect(defaultBrushSize(1920, 1080)).toBe(38);
    expect(defaultBrushSize(360, 450)).toBe(9);
  });

  it("stays within the slider's 4–120 px range", () => {
    expect(defaultBrushSize(100, 80)).toBe(4);
    expect(defaultBrushSize(8000, 6000)).toBe(120);
  });
});
