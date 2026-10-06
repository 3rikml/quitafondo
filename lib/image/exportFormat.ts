import type { PixelBuffer } from "./pixelBuffer";
import type { ExportFormat } from "../types";

export const MIME_BY_FORMAT: Record<ExportFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

export function requiresFlattening(format: ExportFormat): boolean {
  return format === "jpg";
}

export function flattenOnWhite(pixels: PixelBuffer): PixelBuffer {
  const data = new Uint8ClampedArray(pixels.data.length);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const alpha = pixels.data[i + 3] / 255;
    data[i] = Math.round(pixels.data[i] * alpha + 255 * (1 - alpha));
    data[i + 1] = Math.round(pixels.data[i + 1] * alpha + 255 * (1 - alpha));
    data[i + 2] = Math.round(pixels.data[i + 2] * alpha + 255 * (1 - alpha));
    data[i + 3] = 255;
  }
  return { width: pixels.width, height: pixels.height, data };
}
