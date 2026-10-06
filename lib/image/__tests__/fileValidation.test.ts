import { describe, it, expect } from "vitest";
import { MAX_FILE_BYTES, isBackgroundRemovalSupported, validateImageFile } from "../fileValidation";

describe("validateImageFile", () => {
  it("accepts a normal-sized supported image", () => {
    expect(validateImageFile({ type: "image/png", size: 1024 })).toBeNull();
    expect(validateImageFile({ type: "image/JPEG", size: 1024 })).toBeNull();
  });

  it("rejects non-image files", () => {
    expect(validateImageFile({ type: "application/pdf", size: 1024 })).toMatch(/no compatible/i);
  });

  it("rejects image types the pipeline cannot decode", () => {
    expect(validateImageFile({ type: "image/tiff", size: 1024 })).toMatch(/no compatible/i);
  });

  it("rejects files above the size cap", () => {
    expect(validateImageFile({ type: "image/png", size: MAX_FILE_BYTES + 1 })).toMatch(/20 MB/);
  });

  it("rejects empty files", () => {
    expect(validateImageFile({ type: "image/png", size: 0 })).toMatch(/vacío/);
  });
});

describe("isBackgroundRemovalSupported", () => {
  it("is true where WebAssembly exists", () => {
    expect(isBackgroundRemovalSupported()).toBe(true);
  });
});
