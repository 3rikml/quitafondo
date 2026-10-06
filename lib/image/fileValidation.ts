/** Hard cap on the input file size. The model runs in the browser, so very
 * large photos mean long freezes and out-of-memory crashes. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

const SUPPORTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/avif",
]);

/**
 * Returns a Spanish error message when the file cannot be processed, or `null`
 * when it looks fine. Validating up front lets the queue mark the job as failed
 * with a readable reason instead of surfacing a raw library error.
 */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith("image/") || !SUPPORTED_MIME_TYPES.has(file.type.toLowerCase())) {
    return "Formato no compatible. Usa PNG, JPG, WebP, GIF, BMP o AVIF.";
  }
  if (file.size > MAX_FILE_BYTES) {
    const limitMb = Math.round(MAX_FILE_BYTES / (1024 * 1024));
    return `La imagen supera el límite de ${limitMb} MB.`;
  }
  if (file.size === 0) {
    return "El archivo está vacío.";
  }
  return null;
}

/**
 * The background-removal model is a WebAssembly build, so without WASM the app
 * cannot work at all — better to say so than to fail on the first upload.
 */
export function isBackgroundRemovalSupported(): boolean {
  return typeof WebAssembly !== "undefined";
}
