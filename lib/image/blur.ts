/**
 * Approximates a Gaussian blur by repeatedly halving the image and then
 * scaling it back up with bilinear smoothing. Unlike `ctx.filter = "blur()"`
 * this works in every browser (Safari's 2D canvas ignores `filter`), and it
 * costs a handful of `drawImage` calls instead of a per-pixel convolution.
 */
export function blurCanvas(source: HTMLCanvasElement, radiusPx: number): HTMLCanvasElement {
  const { width, height } = source;
  const steps = Math.max(0, Math.round(Math.log2(Math.max(1, radiusPx))));
  if (steps === 0 || width === 0 || height === 0) return source;

  let current = source;
  for (let i = 0; i < steps; i++) {
    const next = document.createElement("canvas");
    next.width = Math.max(1, Math.round(current.width / 2));
    next.height = Math.max(1, Math.round(current.height / 2));
    const ctx = next.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(current, 0, 0, next.width, next.height);
    current = next;
    if (next.width === 1 && next.height === 1) break;
  }

  const result = document.createElement("canvas");
  result.width = width;
  result.height = height;
  const ctx = result.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(current, 0, 0, width, height);
  return result;
}

/**
 * Scale and offset that make a `sourceWidth x sourceHeight` image fully cover
 * a `targetWidth x targetHeight` area (CSS `object-fit: cover`), centered.
 */
export function coverRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return { x: (targetWidth - width) / 2, y: (targetHeight - height) / 2, width, height };
}
