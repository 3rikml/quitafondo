import { describe, expect, it } from "vitest";
import { DEFAULT_BACKGROUND, DEFAULT_CANVAS, DEFAULT_EXPORT } from "@/lib/types";

describe("shared type defaults", () => {
  it("defaults to a transparent background", () => {
    expect(DEFAULT_BACKGROUND).toEqual({ kind: "transparent" });
  });

  it("defaults canvas to the original preset with no forced centering", () => {
    expect(DEFAULT_CANVAS.preset).toBe("original");
    expect(DEFAULT_CANVAS.centerSubject).toBe(false);
  });

  it("defaults export to png at quality 92", () => {
    expect(DEFAULT_EXPORT).toEqual({ format: "png", quality: 92 });
  });
});
