import type { BackgroundConfig, CanvasConfig, ExportConfig } from "../types";
import { computeAlphaBoundingBox } from "./boundingBox";
import { getCropClipRect, resolveCanvasLayout } from "./canvasFit";
import { composeCutoutWithRetouch } from "./composeCutout";
import { paintBackground } from "./drawBackground";
import { MIME_BY_FORMAT, flattenOnWhite, requiresFlattening } from "./exportFormat";
import type { PixelBuffer } from "./pixelBuffer";

/**
 * Renders one job's cutout exactly the way the editor previews it — background
 * beneath, canvas preset dimensions, centering/contain fit, and manual retouch
 * strokes (erase/restore) — and encodes it in the job's export format. Used by
 * the ZIP batch export so that every per-image setting the user configured
 * (including the ones applied with "Aplicar a todas") actually lands in the
 * downloaded files.
 *
 * `retouchOverride` and `originalUrl` are optional: a job that was never
 * retouched has no override buffer, and renders exactly as the model produced
 * it, same as before.
 */
export async function renderJobToBlob(
  cutoutBlob: Blob,
  background: BackgroundConfig,
  canvasConfig: CanvasConfig,
  exportConfig: ExportConfig,
  retouchOverride?: Int16Array | null,
  originalUrl?: string
): Promise<Blob> {
  const bitmap = await createImageBitmap(cutoutBlob);

  try {
    const sourcePixels = readBitmapPixels(bitmap);
    const originalPixels =
      retouchOverride && originalUrl ? await loadOriginalPixels(originalUrl) : null;
    const composedPixels = composeCutoutWithRetouch(
      sourcePixels,
      originalPixels,
      retouchOverride ?? null
    );
    const composedSource = pixelBufferToCanvas(composedPixels);

    // Bounding box comes from the model's own alpha (not the retouched
    // result), matching EditorCanvas: a manual erase/restore stroke
    // shouldn't shift the canvas-preset centering the user already saw.
    const subjectBox = computeAlphaBoundingBox(sourcePixels);
    const { width, height, fit } = resolveCanvasLayout(
      bitmap.width,
      bitmap.height,
      subjectBox,
      canvasConfig
    );

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);

    const backgroundImage =
      background.kind === "image" ? await loadBackgroundBitmap(background.url) : null;
    paintBackground(ctx, width, height, background, backgroundImage);

    ctx.save();
    if (fit.rotationDeg !== 0) {
      ctx.translate(fit.anchorX, fit.anchorY);
      ctx.rotate((fit.rotationDeg * Math.PI) / 180);
      ctx.translate(-fit.anchorX, -fit.anchorY);
    }
    if (canvasConfig.cropBox) {
      const clip = getCropClipRect(fit, canvasConfig.cropBox);
      ctx.beginPath();
      ctx.rect(clip.x, clip.y, clip.width, clip.height);
      ctx.clip();
    }
    ctx.translate(fit.offsetX, fit.offsetY);
    ctx.scale(fit.scale, fit.scale);
    ctx.drawImage(composedSource, 0, 0);
    ctx.restore();

    if (requiresFlattening(exportConfig.format)) {
      const rendered = ctx.getImageData(0, 0, width, height);
      const flattened = flattenOnWhite({ width, height, data: rendered.data });
      ctx.putImageData(
        new ImageData(flattened.data as Uint8ClampedArray<ArrayBuffer>, width, height),
        0,
        0
      );
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, MIME_BY_FORMAT[exportConfig.format], exportConfig.quality / 100)
    );
    if (!blob) throw new Error("No se pudo codificar la imagen exportada.");
    return blob;
  } finally {
    bitmap.close?.();
  }
}

function readBitmapPixels(bitmap: ImageBitmap): PixelBuffer {
  const offscreen = document.createElement("canvas");
  offscreen.width = bitmap.width;
  offscreen.height = bitmap.height;
  const ctx = offscreen.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data: imageData.data };
}

async function loadBackgroundBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(url);
    return await createImageBitmap(await response.blob());
  } catch {
    return null;
  }
}

/**
 * Decodes the pre-removal original photo as a color source for "Restaurar"
 * strokes — same purpose as `EditorCanvas`'s equivalent decode. Optional: a
 * failed fetch/decode just means the batch export skips color repair for that
 * job, same as if no original were available at all.
 */
async function loadOriginalPixels(url: string): Promise<PixelBuffer | null> {
  let bitmap: ImageBitmap | null = null;
  try {
    const response = await fetch(url);
    bitmap = await createImageBitmap(await response.blob());
    return readBitmapPixels(bitmap);
  } catch (error) {
    console.warn("No se pudo decodificar la imagen original para el ZIP; se omite la recuperación de color.", error);
    return null;
  } finally {
    bitmap?.close?.();
  }
}

function pixelBufferToCanvas(pixels: PixelBuffer): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext("2d")!;
  const imageData = new ImageData(pixels.data as Uint8ClampedArray<ArrayBuffer>, pixels.width, pixels.height);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
