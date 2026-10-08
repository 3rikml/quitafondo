import type { ExportConfig } from "../types";
import { MIME_BY_FORMAT, flattenOnWhite, requiresFlattening } from "./exportFormat";
import type { PixelBuffer } from "./pixelBuffer";

/** Encodes the rendered canvas pixels in the given format (JPG is flattened on white). */
export async function encodeRenderedImage(pixels: PixelBuffer, exportConfig: ExportConfig): Promise<Blob | null> {
  const finalPixels = requiresFlattening(exportConfig.format) ? flattenOnWhite(pixels) : pixels;
  const canvas = document.createElement("canvas");
  canvas.width = finalPixels.width;
  canvas.height = finalPixels.height;
  canvas
    .getContext("2d")!
    .putImageData(
      new ImageData(finalPixels.data as Uint8ClampedArray<ArrayBuffer>, finalPixels.width, finalPixels.height),
      0,
      0
    );
  return new Promise((resolve) =>
    canvas.toBlob(resolve, MIME_BY_FORMAT[exportConfig.format], exportConfig.quality / 100)
  );
}

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
  const blob = await encodeRenderedImage(pixels, exportConfig);
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${fileNameBase}.${exportConfig.format}`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Copies the rendered image to the clipboard as PNG (the one image type every
 * browser's clipboard accepts), ready to paste into a chat or design tool.
 * The ClipboardItem gets a promise so Safari keeps the user-gesture context.
 */
export async function copyRenderedImage(pixels: PixelBuffer): Promise<void> {
  const png = encodeRenderedImage(pixels, { format: "png", quality: 100 }).then((blob) => {
    if (!blob) throw new Error("No se pudo codificar la imagen.");
    return blob;
  });
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}
