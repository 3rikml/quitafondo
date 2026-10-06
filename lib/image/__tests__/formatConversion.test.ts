import { describe, it, expect } from "vitest";
import { isNativelySupportedByLibrary } from "../formatConversion";

describe("isNativelySupportedByLibrary", () => {
  it("accepts the exact formats @imgly/background-removal can decode", () => {
    expect(isNativelySupportedByLibrary("image/png")).toBe(true);
    expect(isNativelySupportedByLibrary("image/jpeg")).toBe(true);
    expect(isNativelySupportedByLibrary("image/jpg")).toBe(true);
    expect(isNativelySupportedByLibrary("image/webp")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isNativelySupportedByLibrary("IMAGE/PNG")).toBe(true);
  });

  it("rejects formats our own upload validation allows but the library cannot decode", () => {
    expect(isNativelySupportedByLibrary("image/gif")).toBe(false);
    expect(isNativelySupportedByLibrary("image/bmp")).toBe(false);
    expect(isNativelySupportedByLibrary("image/avif")).toBe(false);
  });

  it("rejects unrelated or empty mime types", () => {
    expect(isNativelySupportedByLibrary("image/svg+xml")).toBe(false);
    expect(isNativelySupportedByLibrary("")).toBe(false);
  });
});
