import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadRenderedImage } from "../downloadImage";
import { DEFAULT_EXPORT } from "@/lib/types";

describe("downloadRenderedImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("rejects when the canvas cannot be encoded, so the caller can report it", async () => {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ putImageData: vi.fn() }),
      toBlob: (cb: (blob: Blob | null) => void) => cb(null),
    };
    vi.stubGlobal("document", { createElement: () => canvas });
    vi.stubGlobal("ImageData", class {});

    const pixels = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
    await expect(downloadRenderedImage(pixels, DEFAULT_EXPORT, "photo")).rejects.toThrow();
  });
});
