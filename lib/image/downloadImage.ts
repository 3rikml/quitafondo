import type { ExportConfig } from "../types";
import { MIME_BY_FORMAT, flattenOnWhite, requiresFlattening } from "./exportFormat";
import type { PixelBuffer } from "./pixelBuffer";

/**
 * Encodes the rendered canvas pixels in the job's export format and saves the
 * file. Shared by the export panel and the always-visible "Descargar" button,
 * so both produce exactly the same file.
 */
export async function downloadRenderedImage(
  pixels: PixelBuffer,
  exportConfig: ExportConfig,
  fileNameBase: string
): Promise<void> {
  const finalPixels = requiresFlattening(exportConfig.format) ? flattenOnWhite(pixels) : pixels;

  const canvas = document.createElement("canvas");
  canvas.width = finalPixels.width;
  canvas.height = finalPixels.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(
    new ImageData(finalPixels.data as Uint8ClampedArray<ArrayBuffer>, finalPixels.width, finalPixels.height),
    0,
    0
  );

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, MIME_BY_FORMAT[exportConfig.format], exportConfig.quality / 100)
  );
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileNameBase}.${exportConfig.format}`;
  link.click();
  URL.revokeObjectURL(url);
}
