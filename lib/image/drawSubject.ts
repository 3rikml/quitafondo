import type { CanvasConfig, ShadowConfig } from "../types";
import { blurCanvas } from "./blur";
import type { BoundingBox } from "./boundingBox";
import type { FitResult } from "./canvasFit";

/** Shadow geometry in source-image pixels, derived from the subject's box. */
export function shadowGeometry(box: BoundingBox, shadow: ShadowConfig) {
  const strength = Math.min(Math.max(shadow.intensity, 0), 100) / 100;
  if (shadow.kind === "soft") {
    return {
      kind: "soft" as const,
      opacity: 0.55 * strength,
      blurPx: Math.max(2, box.height * 0.035),
      offsetY: box.height * 0.025,
    };
  }
  if (shadow.kind === "contact") {
    const radiusX = box.width * 0.48;
    return {
      kind: "contact" as const,
      opacity: 0.75 * strength,
      centerX: box.x + box.width / 2,
      centerY: box.y + box.height,
      radiusX,
      radiusY: Math.max(3, radiusX * 0.14),
    };
  }
  return null;
}

/** Copy of `source` with everything outside `box` cleared, in the same coordinates. */
function clipToBox(source: HTMLCanvasElement, box: BoundingBox): HTMLCanvasElement {
  const clipped = document.createElement("canvas");
  clipped.width = source.width;
  clipped.height = source.height;
  clipped
    .getContext("2d")!
    .drawImage(source, box.x, box.y, box.width, box.height, box.x, box.y, box.width, box.height);
  return clipped;
}

/** Black silhouette of `source`'s alpha channel. */
function silhouette(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Draws the cutout onto the target canvas with the editor's fit (manual
 * rotation, crop, position and scale) plus the configured shadow. Shared by
 * the live editor and the ZIP exporter so both produce identical pixels.
 *
 * `subjectBox` is the model's alpha bounding box; the crop box replaces it
 * when set, matching how the fit itself treats "the subject".
 */
export function drawSubject(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  fit: FitResult,
  canvasConfig: Pick<CanvasConfig, "cropBox" | "shadow">,
  subjectBox: BoundingBox | null,
  options: { withShadow?: boolean } = {}
): void {
  const cropBox = canvasConfig.cropBox ?? null;
  // Cropping in source space (instead of clipping the target canvas) lets the
  // shadow extend past the crop edge, like a real shadow would.
  const layer = cropBox ? clipToBox(source, cropBox) : source;
  const box = cropBox ?? subjectBox;
  const shadow = options.withShadow !== false && box && canvasConfig.shadow
    ? shadowGeometry(box, canvasConfig.shadow)
    : null;

  ctx.save();
  if (fit.rotationDeg !== 0) {
    ctx.translate(fit.anchorX, fit.anchorY);
    ctx.rotate((fit.rotationDeg * Math.PI) / 180);
    ctx.translate(-fit.anchorX, -fit.anchorY);
  }
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);

  if (shadow?.kind === "soft" && shadow.opacity > 0) {
    ctx.save();
    ctx.globalAlpha = shadow.opacity;
    ctx.drawImage(blurCanvas(silhouette(layer), shadow.blurPx), 0, shadow.offsetY);
    ctx.restore();
  } else if (shadow?.kind === "contact" && shadow.opacity > 0) {
    ctx.save();
    ctx.translate(shadow.centerX, shadow.centerY);
    ctx.scale(1, shadow.radiusY / shadow.radiusX);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, shadow.radiusX);
    gradient.addColorStop(0, `rgba(0, 0, 0, ${shadow.opacity})`);
    gradient.addColorStop(0.45, `rgba(0, 0, 0, ${shadow.opacity * 0.45})`);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(-shadow.radiusX, -shadow.radiusX, shadow.radiusX * 2, shadow.radiusX * 2);
    ctx.restore();
  }

  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}
