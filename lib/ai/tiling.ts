/**
 * Splits an image into overlapping tiles for models whose memory use grows
 * with the input size (Swin2SR attention would not fit a 12-megapixel photo
 * in one pass). Each tile is processed with a margin of real neighboring
 * pixels on every inner side, and only its center (`keep`) is written back,
 * so tile seams never show the model's edge artifacts.
 *
 * Every tile has the same size whenever the image is at least one tile big:
 * edge tiles are shifted inwards instead of shrunk. On WebGPU each new input
 * shape recompiles the shaders, so uniform tiles are much faster.
 */
export interface Tile {
  /** Region fed to the model, in input pixels (inclusive start, exclusive end). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Part of that region written to the output, in input pixels. */
  keep: { x: number; y: number; width: number; height: number };
}

export function computeTiles(width: number, height: number, tileSize: number, overlap: number): Tile[] {
  if (tileSize <= 2 * overlap) throw new Error("tileSize must be larger than twice the overlap");
  const step = tileSize - 2 * overlap;
  const tiles: Tile[] = [];

  for (let keepY = 0; keepY < height; keepY += step) {
    for (let keepX = 0; keepX < width; keepX += step) {
      const keepWidth = Math.min(step, width - keepX);
      const keepHeight = Math.min(step, height - keepY);
      const tileWidth = Math.min(tileSize, width);
      const tileHeight = Math.min(tileSize, height);
      tiles.push({
        x: Math.min(Math.max(0, keepX - overlap), width - tileWidth),
        y: Math.min(Math.max(0, keepY - overlap), height - tileHeight),
        width: tileWidth,
        height: tileHeight,
        keep: { x: keepX, y: keepY, width: keepWidth, height: keepHeight },
      });
    }
  }
  return tiles;
}

/**
 * Copies a tile's model output (RGB or RGBA, `scale`x the tile size, possibly
 * padded on the right/bottom) into the RGBA output buffer, keeping only the
 * tile's `keep` region. Alpha is set to opaque.
 */
export function pasteTile(
  output: Uint8ClampedArray,
  outputWidth: number,
  tile: Tile,
  tileData: ArrayLike<number>,
  tileDataWidth: number,
  tileChannels: number,
  scale: number
): void {
  const srcX0 = (tile.keep.x - tile.x) * scale;
  const srcY0 = (tile.keep.y - tile.y) * scale;
  const w = tile.keep.width * scale;
  const h = tile.keep.height * scale;
  const dstX0 = tile.keep.x * scale;
  const dstY0 = tile.keep.y * scale;

  for (let row = 0; row < h; row++) {
    let src = ((srcY0 + row) * tileDataWidth + srcX0) * tileChannels;
    let dst = ((dstY0 + row) * outputWidth + dstX0) * 4;
    for (let col = 0; col < w; col++) {
      output[dst] = tileData[src];
      output[dst + 1] = tileData[src + 1];
      output[dst + 2] = tileData[src + 2];
      output[dst + 3] = 255;
      src += tileChannels;
      dst += 4;
    }
  }
}
