import type { BackgroundConfig } from "../types";

/**
 * Paints a `BackgroundConfig` across the whole canvas, beneath the cutout.
 *
 * Image backgrounds need their bitmap loaded before they can be drawn, and the
 * two callers load it differently (the live editor keeps a cache of
 * `HTMLImageElement`s and redraws on load; the off-screen exporter awaits an
 * `ImageBitmap`), so the already-loaded drawable is passed in instead of being
 * fetched here. Passing `null`/`undefined` for an image background simply
 * leaves the background transparent for this pass.
 */
export function paintBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  background: BackgroundConfig,
  image?: CanvasImageSource | null
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
  }
}
