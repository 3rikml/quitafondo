/**
 * Sharpens the soft edge of a cutout using the photo's own colors.
 *
 * The segmentation models see the photo at about 1024 px and their mask is
 * then enlarged to the photo's size, so the edge comes out blurry and misses
 * fine detail (hair, fur, thin straps). Near the edge this module estimates
 * the typical color of the subject and of the background from the pixels the
 * mask is sure about, and then places every doubtful pixel on the line between
 * them: a pixel the color of the subject becomes opaque, one the color of the
 * backdrop becomes transparent, and one in between keeps its partial alpha.
 *
 * Safeguards: only pixels the mask was unsure about change (so the subject's
 * own texture can never punch holes in it), they may move by at most
 * `MAX_SHIFT`, and where subject and background look alike the original mask
 * is kept.
 */

/** Alpha values at or below / above these are "decided" (0 and 255 plus rounding noise). */
const DECIDED_LOW = 6;
const DECIDED_HIGH = 249;
/** A pixel may move at most this much (0-1) from the model's own alpha. */
const MAX_SHIFT = 0.6;
/** Squared color distance (0-3 scale) between subject and background at which the color is fully trusted. */
const FULL_TRUST_SEPARATION = 0.06;
/** Fewest sure pixels of each kind a window needs before its colors are trusted. */
const MIN_SURE_PIXELS = 3;
/** Core size of the tiles the image is processed in (keeps the working arrays small). */
const TILE = 512;

export interface EdgeMattingOptions {
  /** How far (px) to look for sure subject/background pixels: a bit more than the mask's blur. */
  radius: number;
}

/** The mask's blur grows with how much it was enlarged, so the search radius does too. */
export function defaultMattingOptions(width: number, height: number): EdgeMattingOptions {
  const enlargement = Math.max(1, Math.max(width, height) / 1024);
  return { radius: Math.min(24, Math.max(4, Math.round(enlargement * 5))) };
}

/** Mean over the (edge-clipped) window of `radius` around every pixel, separable running sums. */
function boxFilter(src: Float32Array, width: number, height: number, radius: number, dst: Float32Array, tmp: Float32Array) {
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let sum = 0;
    let count = 0;
    for (let x = 0; x <= Math.min(radius, width - 1); x++) {
      sum += src[row + x];
      count++;
    }
    for (let x = 0; x < width; x++) {
      tmp[row + x] = sum / count;
      const add = x + radius + 1;
      const remove = x - radius;
      if (add < width) {
        sum += src[row + add];
        count++;
      }
      if (remove >= 0) {
        sum -= src[row + remove];
        count--;
      }
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y <= Math.min(radius, height - 1); y++) {
      sum += tmp[y * width + x];
      count++;
    }
    for (let y = 0; y < height; y++) {
      dst[y * width + x] = sum / count;
      const add = y + radius + 1;
      const remove = y - radius;
      if (add < height) {
        sum += tmp[add * width + x];
        count++;
      }
      if (remove >= 0) {
        sum -= tmp[remove * width + x];
        count--;
      }
    }
  }
}

/** Reusable float buffers for one tile, so tiles don't allocate over and over. */
class Workspace {
  private readonly buffers: Float32Array[] = [];
  private used = 0;
  constructor(private readonly size: number) {}
  reset() {
    this.used = 0;
  }
  take(): Float32Array {
    if (this.used === this.buffers.length) this.buffers.push(new Float32Array(this.size));
    return this.buffers[this.used++];
  }
}

function isUncertain(alpha: number): boolean {
  return alpha > DECIDED_LOW && alpha < DECIDED_HIGH;
}

/**
 * Refines the alpha channel of `rgba` (width×height, 4 bytes per pixel) in
 * place. RGB is the photo and is not modified.
 */
export function refineEdgeAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: EdgeMattingOptions = defaultMattingOptions(width, height)
): void {
  const { radius } = options;
  const margin = radius + 1;
  const maxSide = TILE + 2 * margin;
  const workspace = new Workspace(maxSide * maxSide);
  const original = new Uint8ClampedArray(height * width);
  for (let i = 0; i < original.length; i++) original[i] = rgba[i * 4 + 3];

  for (let ty = 0; ty < height; ty += TILE) {
    for (let tx = 0; tx < width; tx += TILE) {
      const cx1 = Math.min(width, tx + TILE);
      const cy1 = Math.min(height, ty + TILE);
      if (!hasUncertain(original, width, height, tx, ty, cx1, cy1)) continue;

      const rx0 = Math.max(0, tx - margin);
      const ry0 = Math.max(0, ty - margin);
      const rx1 = Math.min(width, cx1 + margin);
      const ry1 = Math.min(height, cy1 + margin);
      refineRegion(rgba, original, width, rx0, ry0, rx1 - rx0, ry1 - ry0, { tx, ty, cx1, cy1 }, radius, workspace);
    }
  }
}

function hasUncertain(alpha: Uint8ClampedArray, width: number, height: number, x0: number, y0: number, x1: number, y1: number): boolean {
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    for (let x = x0; x < x1; x++) if (isUncertain(alpha[row + x])) return true;
  }
  return false;
}

function refineRegion(
  rgba: Uint8ClampedArray,
  original: Uint8ClampedArray,
  imageWidth: number,
  rx: number,
  ry: number,
  w: number,
  h: number,
  core: { tx: number; ty: number; cx1: number; cy1: number },
  radius: number,
  ws: Workspace
) {
  ws.reset();
  const n = w * h;
  const I = [ws.take(), ws.take(), ws.take()];
  const fgMask = ws.take();
  const bgMask = ws.take();
  const tmp = ws.take();
  const scratch = ws.take();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const source = (ry + y) * imageWidth + (rx + x);
      I[0][i] = rgba[source * 4] / 255;
      I[1][i] = rgba[source * 4 + 1] / 255;
      I[2][i] = rgba[source * 4 + 2] / 255;
      fgMask[i] = original[source] >= DECIDED_HIGH ? 1 : 0;
      bgMask[i] = original[source] <= DECIDED_LOW ? 1 : 0;
    }
  }

  // Fraction of sure subject / sure background pixels in each window, and their summed colors.
  const fgCount = ws.take();
  const bgCount = ws.take();
  boxFilter(fgMask, w, h, radius, fgCount, tmp);
  boxFilter(bgMask, w, h, radius, bgCount, tmp);
  const fgColor = [ws.take(), ws.take(), ws.take()];
  const bgColor = [ws.take(), ws.take(), ws.take()];
  for (let c = 0; c < 3; c++) {
    for (let i = 0; i < n; i++) scratch[i] = I[c][i] * fgMask[i];
    boxFilter(scratch, w, h, radius, fgColor[c], tmp);
    for (let i = 0; i < n; i++) scratch[i] = I[c][i] * bgMask[i];
    boxFilter(scratch, w, h, radius, bgColor[c], tmp);
  }

  const minFraction = MIN_SURE_PIXELS / ((2 * radius + 1) * (2 * radius + 1));
  for (let y = core.ty; y < core.cy1; y++) {
    for (let x = core.tx; x < core.cx1; x++) {
      const alphaIndex = y * imageWidth + x;
      const model = original[alphaIndex];
      if (!isUncertain(model)) continue;
      const i = (y - ry) * w + (x - rx);
      if (fgCount[i] < minFraction || bgCount[i] < minFraction) continue;

      // Mean colors are sums over the window divided by its sure-pixel fraction.
      const f0 = fgColor[0][i] / fgCount[i];
      const f1 = fgColor[1][i] / fgCount[i];
      const f2 = fgColor[2][i] / fgCount[i];
      const b0 = bgColor[0][i] / bgCount[i];
      const b1 = bgColor[1][i] / bgCount[i];
      const b2 = bgColor[2][i] / bgCount[i];
      const d0 = f0 - b0;
      const d1 = f1 - b1;
      const d2 = f2 - b2;
      const separation = d0 * d0 + d1 * d1 + d2 * d2;
      if (separation < 1e-6) continue;

      const projected = ((I[0][i] - b0) * d0 + (I[1][i] - b1) * d1 + (I[2][i] - b2) * d2) / separation;
      const trust = Math.min(1, separation / FULL_TRUST_SEPARATION);
      const prior = model / 255;
      const target = Math.min(1, Math.max(0, projected));
      const blended = prior + (target - prior) * trust;
      const alpha = Math.min(prior + MAX_SHIFT, Math.max(prior - MAX_SHIFT, blended));
      rgba[alphaIndex * 4 + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
    }
  }
}
