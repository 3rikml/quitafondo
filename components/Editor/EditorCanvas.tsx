"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { BackgroundConfig, CanvasConfig } from "@/lib/types";
import { computeAlphaBoundingBox, type BoundingBox } from "@/lib/image/boundingBox";
import { resolveCanvasLayout, type FitResult } from "@/lib/image/canvasFit";
import { drawSubject } from "@/lib/image/drawSubject";
import { paintBackground } from "@/lib/image/drawBackground";
import { createOverrideBuffer } from "@/lib/image/alphaCompose";
import { composeCutoutWithRetouch } from "@/lib/image/composeCutout";
import { refineCutout } from "@/lib/image/edgeRefine";
import type { PixelBuffer } from "@/lib/image/pixelBuffer";

export type CanvasFit = FitResult;

export interface EditorCanvasHandle {
  /**
   * The canvas exactly as the user sees it: background, canvas preset
   * dimensions, centering/contain fit and retouch strokes all baked in. This is
   * what single-image export must encode — the source-space composed buffer
   * (used internally) has none of that applied.
   */
  getRenderedPixelBuffer(): PixelBuffer | null;
  /** The scale/offset last used to draw the source image onto the canvas — needed to convert pointer events (canvas pixel space) into source-image pixel space for retouching. */
  getFit(): CanvasFit | null;
  /** Dimensions of the decoded cutout (and of the override buffer) — NOT the on-screen canvas size, which differs whenever a resize preset is active. */
  getSourceSize(): { width: number; height: number } | null;
  /** The subject's tight bounding box in source-image pixel coordinates (null
   * for a fully-transparent cutout) — needed to position resize handles on
   * screen via `getFit()`. */
  getSubjectBox(): BoundingBox | null;
  /**
   * The decoded cutout's own RGBA pixels (the model's output, unaffected by
   * retouch overrides), indexed the same way as the override buffer
   * (`y * width + x`, source-image space). Needed by the "smart" retouch
   * brush to flood-fill by color/alpha similarity instead of painting a
   * plain circle.
   */
  getSourcePixels(): PixelBuffer | null;
}

interface EditorCanvasProps {
  cutoutBlob: Blob;
  /**
   * Object URL of the pre-removal original photo. It is decoded alongside the
   * cutout purely as a color source: a "Restaurar" stroke over a region the
   * model erased has no usable RGB in the cutout (the 2D-canvas decode
   * premultiplies alpha, zeroing the RGB of every alpha-0 pixel), so the real
   * subject color has to come from here. See `substituteRestoredRgb`.
   */
  originalUrl: string;
  background: BackgroundConfig;
  canvasConfig: CanvasConfig;
  /**
   * Hands back the retouch override buffer for the currently-selected job,
   * creating it only if this job has never been retouched. The parent owns the
   * buffers (keyed by job id) so that switching images and coming back keeps
   * the earlier strokes.
   */
  getOverrideBuffer: (pixelCount: number) => Int16Array;
  /** Bumped by the parent whenever a retouch stroke mutates the override buffer, to force a redraw. */
  retouchVersion: number;
  /**
   * Called after every completed `render()` — including the first one, which
   * only happens once the cutout's async decode finishes. The parent uses
   * this to know when `getFit()`/`getSubjectBox()` actually have fresh data
   * worth reading (e.g. to position resize handles), since a plain prop-change
   * effect on the parent's side would otherwise run one tick too early, before
   * this component's own internal decode has resolved.
   */
  onRender?: () => void;
  /**
   * Before/after comparison: when set (0-1), the original photo is drawn on a
   * separate overlay canvas, with the same fit, and revealed left of this
   * horizontal fraction. The main canvas is left untouched so exporting while
   * comparing never bakes the original into the downloaded image.
   */
  compareSplit?: number | null;
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(function EditorCanvas(
  { cutoutBlob, originalUrl, background, canvasConfig, getOverrideBuffer, retouchVersion, onRender, compareSplit = null },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const compareCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const sourcePixelsRef = useRef<PixelBuffer | null>(null);
  const originalPixelsRef = useRef<PixelBuffer | null>(null);
  const warnedDimensionMismatchRef = useRef(false);
  const subjectBoxRef = useRef<BoundingBox | null>(null);
  const overrideAlphaRef = useRef<Int16Array | null>(null);
  // Edge refinement is a full-image pass; cache it so brush repaints (which
  // only change the overrides) don't redo it on every frame.
  const refinedRef = useRef<{ key: string; source: PixelBuffer; original: PixelBuffer | null; pixels: PixelBuffer } | null>(
    null
  );
  const fitRef = useRef<CanvasFit | null>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());

  // Decode the cutout blob once per job.
  useEffect(() => {
    let cancelled = false;

    // Drop the previous job's derived state immediately so a render triggered
    // before this decode resolves cannot mix job A's pixels with job B's.
    bitmapRef.current = null;
    sourcePixelsRef.current = null;
    subjectBoxRef.current = null;
    overrideAlphaRef.current = null;

    createImageBitmap(cutoutBlob).then((bitmap) => {
      if (cancelled) return;
      bitmapRef.current = bitmap;

      sourcePixelsRef.current = readBitmapPixels(bitmap);
      subjectBoxRef.current = computeAlphaBoundingBox(sourcePixelsRef.current);

      // Never create the buffer here: the parent may already hold this job's
      // earlier retouch strokes, and overwriting them would discard them.
      overrideAlphaRef.current = getOverrideBuffer(bitmap.width * bitmap.height);

      render();
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoutBlob]);

  // Decode the pre-removal original once per job, as a color source for
  // "Restaurar" over regions the model erased. It is strictly optional: if the
  // fetch/decode fails, or the dimensions do not line up with the cutout, the
  // canvas renders exactly as it did before, just without the color repair.
  useEffect(() => {
    let cancelled = false;
    originalPixelsRef.current = null;
    originalCanvasRef.current = null;
    warnedDimensionMismatchRef.current = false;

    if (!originalUrl) return;

    let bitmap: ImageBitmap | null = null;
    fetch(originalUrl)
      .then((response) => response.blob())
      .then((blob) => createImageBitmap(blob))
      .then((decoded) => {
        bitmap = decoded;
        if (cancelled) return;
        originalPixelsRef.current = readBitmapPixels(decoded);
        render();
      })
      .catch((error) => {
        console.warn(
          "No se pudo decodificar la imagen original; \"Restaurar\" usará el color del recorte.",
          error
        );
      })
      .finally(() => {
        bitmap?.close?.();
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalUrl]);

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [background, canvasConfig, retouchVersion, compareSplit !== null]);

  function render() {
    const canvas = canvasRef.current;
    const bitmap = bitmapRef.current;
    const sourcePixels = sourcePixelsRef.current;
    if (!canvas || !bitmap || !sourcePixels) return;

    const { width, height, fit } = resolveCanvasLayout(
      bitmap.width,
      bitmap.height,
      subjectBoxRef.current,
      canvasConfig
    );
    canvas.width = width;
    canvas.height = height;
    fitRef.current = fit;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);

    paintBackground(
      ctx,
      width,
      height,
      background,
      background.kind === "image"
        ? resolveCachedImage(background.url, imageCacheRef.current, () => render())
        : background.kind === "blur"
          ? getOriginalCanvas()
          : null,
      fit
    );

    const composedBuffer = getComposedBuffer(sourcePixels);
    drawSubject(ctx, pixelBufferToCanvas(composedBuffer), fit, canvasConfig, subjectBoxRef.current);

    renderComparison(width, height, fit);
    onRender?.();
  }

  /** The decoded original photo as a drawable canvas, or null until it has loaded. */
  function getOriginalCanvas(): HTMLCanvasElement | null {
    const originalPixels = originalPixelsRef.current;
    if (!originalPixels) return null;
    originalCanvasRef.current ??= pixelBufferToCanvas(originalPixels);
    return originalCanvasRef.current;
  }

  /** Draws the untouched original photo, with the same fit as the cutout, onto the overlay canvas. */
  function renderComparison(width: number, height: number, fit: CanvasFit) {
    const overlay = compareCanvasRef.current;
    const original = getOriginalCanvas();
    if (!overlay || compareSplit === null || !original) return;

    overlay.width = width;
    overlay.height = height;
    const ctx = overlay.getContext("2d")!;
    ctx.clearRect(0, 0, width, height);
    drawSubject(ctx, original, fit, canvasConfig, subjectBoxRef.current, { withShadow: false });
  }

  /**
   * Source-space cutout RGBA with the retouch overrides applied to its alpha,
   * plus the color repair for pixels a "Restaurar" stroke brought back from a
   * region the model had erased (whose cutout RGB is unusable).
   */
  function getComposedBuffer(sourcePixels: PixelBuffer): PixelBuffer {
    const overrides = overrideAlphaRef.current ?? createOverrideBuffer(sourcePixels.width * sourcePixels.height);
    const originalPixels = originalPixelsRef.current;

    if (
      originalPixels &&
      (originalPixels.width !== sourcePixels.width || originalPixels.height !== sourcePixels.height) &&
      !warnedDimensionMismatchRef.current
    ) {
      // Once per job: render() runs on every throttled brush repaint.
      warnedDimensionMismatchRef.current = true;
      console.warn(
        `La imagen original (${originalPixels.width}x${originalPixels.height}) no coincide con el recorte (${sourcePixels.width}x${sourcePixels.height}); se omite la recuperación de color.`
      );
    }

    return composeCutoutWithRetouch(getRefinedCutout(sourcePixels, originalPixels), originalPixels, overrides);
  }

  function getRefinedCutout(sourcePixels: PixelBuffer, originalPixels: PixelBuffer | null): PixelBuffer {
    const key = JSON.stringify(canvasConfig.edge);
    const cached = refinedRef.current;
    if (cached && cached.key === key && cached.source === sourcePixels && cached.original === originalPixels) {
      return cached.pixels;
    }
    const pixels = refineCutout(sourcePixels, originalPixels, canvasConfig.edge);
    refinedRef.current = { key, source: sourcePixels, original: originalPixels, pixels };
    return pixels;
  }

  useImperativeHandle(ref, () => ({
    getRenderedPixelBuffer() {
      const canvas = canvasRef.current;
      if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return { width: canvas.width, height: canvas.height, data: imageData.data };
    },
    getFit() {
      return fitRef.current;
    },
    getSourceSize() {
      const sourcePixels = sourcePixelsRef.current;
      return sourcePixels ? { width: sourcePixels.width, height: sourcePixels.height } : null;
    },
    getSubjectBox() {
      return subjectBoxRef.current;
    },
    getSourcePixels() {
      return sourcePixelsRef.current;
    },
  }));

  return (
    <>
      <canvas
        ref={canvasRef}
        className="max-h-full max-w-full rounded-lg shadow-sm"
        style={{
          // Neutral mid-gray checker so transparency reads correctly in both the
          // light and the dark theme (a light-gray/white checker looked washed
          // out and wrong on a dark background).
          backgroundImage:
            "linear-gradient(45deg, var(--checker-dark) 25%, transparent 25%), linear-gradient(-45deg, var(--checker-dark) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, var(--checker-dark) 75%), linear-gradient(-45deg, transparent 75%, var(--checker-dark) 75%)",
          backgroundColor: "var(--checker-light)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
        }}
      />
      {compareSplit !== null && (
        <canvas
          ref={compareCanvasRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full rounded-lg"
          style={{ clipPath: `inset(0 ${(1 - compareSplit) * 100}% 0 0)` }}
        />
      )}
    </>
  );
});

/**
 * Returns the cached, fully-loaded background image if it is ready to draw, and
 * otherwise kicks off the load (once) and schedules a redraw via `onLoad`.
 */
function resolveCachedImage(
  url: string,
  imageCache: Map<string, HTMLImageElement>,
  onLoad: () => void
): HTMLImageElement | null {
  const cached = imageCache.get(url);
  if (cached) return cached.complete ? cached : null;

  const img = new Image();
  img.onload = onLoad;
  imageCache.set(url, img);
  img.src = url;
  return null;
}

/** Decodes a bitmap into a plain RGBA buffer via an offscreen 2D canvas. */
function readBitmapPixels(bitmap: ImageBitmap): PixelBuffer {
  const offscreen = document.createElement("canvas");
  offscreen.width = bitmap.width;
  offscreen.height = bitmap.height;
  const ctx = offscreen.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data: imageData.data };
}

function pixelBufferToCanvas(pixels: PixelBuffer): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const ctx = canvas.getContext("2d")!;
  const imageData = new ImageData(
    pixels.data as Uint8ClampedArray<ArrayBuffer>,
    pixels.width,
    pixels.height
  );
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
