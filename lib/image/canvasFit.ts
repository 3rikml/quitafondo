import type { BoundingBox } from "./boundingBox";
import type { CanvasConfig } from "../types";

/** Scale + translate only, before rotation is folded in. */
interface ScaleOffset {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface FitResult extends ScaleOffset {
  /** Manual rotation in degrees, applied around (anchorX, anchorY) in
   * target-canvas pixel coordinates — same anchor the manual-resize anchor
   * uses, so straightening/rotating a photo pivots on the subject's own
   * center instead of the canvas corner. */
  rotationDeg: number;
  anchorX: number;
  anchorY: number;
}

/** Normalizes any rotation value to (-180, 180]. */
export function normalizeRotationDeg(rotationDeg: number): number {
  let normalized = rotationDeg % 360;
  if (normalized <= -180) normalized += 360;
  if (normalized > 180) normalized -= 360;
  return normalized;
}

export function computeCenteredFit(
  sourceWidth: number,
  sourceHeight: number,
  subjectBox: BoundingBox,
  canvasWidth: number,
  canvasHeight: number,
  marginPercent: number
): ScaleOffset {
  const clampedMargin = Math.min(Math.max(marginPercent, 0), 45);
  const availableWidth = canvasWidth * (1 - (2 * clampedMargin) / 100);
  const availableHeight = canvasHeight * (1 - (2 * clampedMargin) / 100);

  const scale = Math.min(availableWidth / subjectBox.width, availableHeight / subjectBox.height);

  const subjectCenterX = (subjectBox.x + subjectBox.width / 2) * scale;
  const subjectCenterY = (subjectBox.y + subjectBox.height / 2) * scale;

  const offsetX = canvasWidth / 2 - subjectCenterX;
  const offsetY = canvasHeight / 2 - subjectCenterY;

  return { scale, offsetX, offsetY };
}

/**
 * Uniformly scales the WHOLE source image down (or up) so it fits entirely
 * inside the target canvas, centred, with no margin. Used when the user picked
 * a resize preset but left "Centrar sujeto" off: the canvas dimensions change,
 * so a 1:1 identity transform would crop to the top-left corner instead of
 * showing the whole image.
 */
export function computeContainFit(
  sourceWidth: number,
  sourceHeight: number,
  canvasWidth: number,
  canvasHeight: number
): ScaleOffset {
  const scale = Math.min(canvasWidth / sourceWidth, canvasHeight / sourceHeight);
  return {
    scale,
    offsetX: (canvasWidth - sourceWidth * scale) / 2,
    offsetY: (canvasHeight - sourceHeight * scale) / 2,
  };
}

export interface CanvasLayout {
  /** Target canvas width in pixels. */
  width: number;
  /** Target canvas height in pixels. */
  height: number;
  fit: FitResult;
}

/**
 * Single source of truth for "given this source image and this CanvasConfig,
 * how big is the output canvas and how should the source be drawn onto it?".
 * Shared by the live editor canvas and the off-screen batch/export renderer so
 * the preview and the exported file can never disagree.
 */
export function resolveCanvasLayout(
  sourceWidth: number,
  sourceHeight: number,
  subjectBox: BoundingBox | null,
  canvasConfig: CanvasConfig
): CanvasLayout {
  // A user-drawn crop takes over as "the subject" for every fit computation
  // (and the caller clips the render to it via `getCropClipRect`) — see the
  // field doc on `CanvasConfig.cropBox` for why this exists.
  const cropBox = canvasConfig.cropBox ?? null;
  const effectiveWidth = cropBox?.width ?? sourceWidth;
  const effectiveHeight = cropBox?.height ?? sourceHeight;

  const useSourceSize =
    canvasConfig.preset === "original" || canvasConfig.widthPx <= 0 || canvasConfig.heightPx <= 0;
  const width = useSourceSize ? effectiveWidth : canvasConfig.widthPx;
  const height = useSourceSize ? effectiveHeight : canvasConfig.heightPx;

  const box = cropBox ?? subjectBox ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const rotationDeg = normalizeRotationDeg(canvasConfig.rotationDeg ?? 0);

  let fit: ScaleOffset;
  if (canvasConfig.centerSubject) {
    // `box` is already absolute in full-source coordinates (cropBox included),
    // so the centered fit naturally centers the crop rect — no correction needed.
    fit = computeCenteredFit(sourceWidth, sourceHeight, box, width, height, canvasConfig.marginPercent);
  } else {
    // computeContainFit assumes the thing being fit starts at source (0,0).
    // When a crop is active, that's the crop's top-left, not the full
    // image's — correct for the difference afterward.
    fit = computeContainFit(effectiveWidth, effectiveHeight, width, height);
    if (cropBox) {
      fit = {
        scale: fit.scale,
        offsetX: fit.offsetX - cropBox.x * fit.scale,
        offsetY: fit.offsetY - cropBox.y * fit.scale,
      };
    }
  }

  // Manual drag/nudge is a delta on top of the automatic fit, not a
  // replacement for it — the user still starts from a sensible position and
  // adjusts from there.
  const offsetFit: ScaleOffset = {
    scale: fit.scale,
    offsetX: fit.offsetX + canvasConfig.offsetX,
    offsetY: fit.offsetY + canvasConfig.offsetY,
  };

  // Manual resize is anchored on the subject's own on-screen center (not the
  // canvas's top-left corner, which is what naively multiplying `scale` would
  // anchor on) — growing or shrinking the subject should look like it scales
  // in place, not like it drifts toward a corner. Rotation shares the same
  // anchor, so straightening a photo pivots on the subject instead of the
  // canvas corner too.
  const subjectCenterX = box.x + box.width / 2;
  const subjectCenterY = box.y + box.height / 2;
  const manualScale = canvasConfig.manualScale ?? 1;

  let scaledFit: ScaleOffset;
  if (manualScale === 1) {
    scaledFit = offsetFit;
  } else {
    const anchorX = offsetFit.offsetX + subjectCenterX * offsetFit.scale;
    const anchorY = offsetFit.offsetY + subjectCenterY * offsetFit.scale;
    const finalScale = offsetFit.scale * manualScale;
    scaledFit = {
      scale: finalScale,
      offsetX: anchorX - subjectCenterX * finalScale,
      offsetY: anchorY - subjectCenterY * finalScale,
    };
  }

  return {
    width,
    height,
    fit: {
      ...scaledFit,
      rotationDeg,
      anchorX: scaledFit.offsetX + subjectCenterX * scaledFit.scale,
      anchorY: scaledFit.offsetY + subjectCenterY * scaledFit.scale,
    },
  };
}

/**
 * Projects a crop box (full-source pixel coordinates) through a layout's
 * final fit into target-canvas pixel coordinates — the rectangle the
 * renderer should clip to so only the cropped region is visible. Using the
 * *final* fit (after the manual offset/resize already folded in) keeps the
 * clip glued to the subject as the user drags or resizes it.
 */
export function getCropClipRect(
  fit: FitResult,
  cropBox: BoundingBox
): { x: number; y: number; width: number; height: number } {
  return {
    x: fit.offsetX + cropBox.x * fit.scale,
    y: fit.offsetY + cropBox.y * fit.scale,
    width: cropBox.width * fit.scale,
    height: cropBox.height * fit.scale,
  };
}
