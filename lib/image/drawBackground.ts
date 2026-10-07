import type { BackgroundConfig } from "../types";
import { blurCanvas, coverRect } from "./blur";
import type { FitResult } from "./canvasFit";

/**
 * Paints a `BackgroundConfig` across the whole canvas, beneath the cutout.
 *
 * Image backgrounds need their bitmap loaded before they can be drawn, and the
 * two callers load it differently (the live editor keeps a cache of
 * `HTMLImageElement`s and redraws on load; the off-screen exporter awaits an
 * `ImageBitmap`), so the already-loaded drawable is passed in instead of being
 * fetched here. Passing `null`/`undefined` for an image background simply
 * leaves the background transparent for this pass. For a `blur` background
 * the drawable is the original photo, which must be a canvas, and `fit` is
 * the subject's own fit, so the blurred scene lines up behind the cutout.
 */
export function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: BackgroundConfig,
  image?: CanvasImageSource | null,
  fit?: FitResult | null
): void {
  if (background.kind === "transparent") return;

  if (background.kind === "solid") {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (background.kind === "gradient") {
    const angle = (background.angleDeg * Math.PI) / 180;
    const x1 = width / 2 - (Math.cos(angle) * width) / 2;
    const y1 = height / 2 - (Math.sin(angle) * height) / 2;
    const x2 = width / 2 + (Math.cos(angle) * width) / 2;
    const y2 = height / 2 + (Math.sin(angle) * height) / 2;
    const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
    gradient.addColorStop(0, background.from);
    gradient.addColorStop(1, background.to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  if (background.kind === "image" && image) {
    ctx.drawImage(image, 0, 0, width, height);
    return;
  }

  if (background.kind === "blur" && image instanceof HTMLCanvasElement) {
    const radius = (Math.min(Math.max(background.amount, 0), 100) / 100) * Math.min(width, height) * 0.06;
    // Bottom layer: the photo covering the whole target, so canvas presets
    // wider/taller than the photo never show empty corners.
    const covered = createCanvas(width, height);
    const rect = coverRect(image.width, image.height, width, height);
    covered.getContext("2d")!.drawImage(image, rect.x, rect.y, rect.width, rect.height);
    ctx.drawImage(blurCanvas(covered, radius), 0, 0);
    if (!fit) return;

    // Top layer: the photo exactly where the subject sits, so the blurred
    // scene lines up with the cutout instead of showing a shifted ghost of it.
    const aligned = createCanvas(width, height);
    const alignedCtx = aligned.getContext("2d")!;
    if (fit.rotationDeg !== 0) {
      alignedCtx.translate(fit.anchorX, fit.anchorY);
      alignedCtx.rotate((fit.rotationDeg * Math.PI) / 180);
      alignedCtx.translate(-fit.anchorX, -fit.anchorY);
    }
    alignedCtx.translate(fit.offsetX, fit.offsetY);
    alignedCtx.scale(fit.scale, fit.scale);
    alignedCtx.drawImage(image, 0, 0);
    ctx.drawImage(blurCanvas(aligned, radius), 0, 0);
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}
