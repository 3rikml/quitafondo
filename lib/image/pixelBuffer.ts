export interface PixelBuffer {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major, same layout as CanvasRenderingContext2D ImageData.data */
  data: Uint8ClampedArray;
}

export function createPixelBuffer(width: number, height: number): PixelBuffer {
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}
