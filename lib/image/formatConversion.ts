import { t } from "../i18n";

/**
 * Formats every browser decodes reliably, including inside the segmentation
 * Web Worker. Our upload validation (`fileValidation.ts`) intentionally allows
 * a wider set (gif/bmp/avif); those are normalized to PNG up front so an
 * exotic format fails here with a readable message instead of deep inside the
 * model pipeline. This is the single source of truth for that narrower set.
 */
const LIBRARY_SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

export function isNativelySupportedByLibrary(mimeType: string): boolean {
  return LIBRARY_SUPPORTED_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
 * Re-encodes a file to PNG if the background-removal library can't decode its
 * format directly. The library always decodes via `createImageBitmap` before
 * touching its model anyway, so anything the browser itself can decode can be
 * converted up front instead of failing deep inside the library with a raw
 * "Invalid format" error.
 */
export async function ensureSupportedImageFormat(file: File | Blob): Promise<Blob> {
  if (isNativelySupportedByLibrary(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(t("error.unreadable"));
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error(t("error.convertFailed"));
    return blob;
  } finally {
    bitmap.close();
  }
}
