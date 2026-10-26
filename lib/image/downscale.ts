/**
 * Longest side a photo is processed at. Larger photos (a 48 MP phone shot is
 * 8000 px wide) exhaust browser memory in the model and the editor's
 * full-resolution buffers, especially on phones.
 */
export const MAX_IMAGE_SIDE = 4096;

/** The size `width x height` must shrink to so its longest side fits `maxSide`, or null if it already fits. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } | null {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return null;
  const scale = maxSide / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Returns a reduced copy of `file` when its longest side exceeds
 * `MAX_IMAGE_SIDE` (JPEG stays JPEG, everything else becomes PNG), or null
 * when it is already small enough or cannot be decoded here.
 */
export async function downscaleIfHuge(
  file: Blob
): Promise<{ blob: Blob; width: number; height: number } | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null; // let the normal pipeline report the decode error
  }
  try {
    const target = fitWithin(bitmap.width, bitmap.height, MAX_IMAGE_SIDE);
    if (!target) return null;
    const isJpeg = file.type === "image/jpeg" || file.type === "image/jpg";
    const type = isJpeg ? "image/jpeg" : "image/png";
    const quality = isJpeg ? 0.95 : undefined;
    // OffscreenCanvas is missing in older Safari: fall back to a regular canvas.
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(target.width, target.height)
        : Object.assign(document.createElement("canvas"), { width: target.width, height: target.height });
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob =
      canvas instanceof HTMLCanvasElement
        ? await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
        : await canvas.convertToBlob({ type, quality });
    if (!blob) return null; // let the normal pipeline handle the full-size photo
    return { blob, ...target };
  } finally {
    bitmap.close();
  }
}
