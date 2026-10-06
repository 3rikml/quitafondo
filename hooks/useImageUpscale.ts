import Upscaler from "upscaler";
import x2 from "@upscalerjs/esrgan-medium/2x";

/**
 * Lazily created once and reused across calls: constructing `Upscaler` loads
 * its (bundled, local — no network fetch) ESRGAN model, and that cost
 * shouldn't repeat for every image the user enhances in a session.
 *
 * Explicitly using `esrgan-medium`'s 2x model instead of Upscaler's own
 * default (`esrgan-slim`, ~3x smaller) — the slim model is tuned for speed
 * over quality and its output is barely distinguishable from a plain resize.
 */
let upscalerInstance: InstanceType<typeof Upscaler> | null = null;

function getUpscaler(): InstanceType<typeof Upscaler> {
  if (!upscalerInstance) upscalerInstance = new Upscaler({ model: x2 });
  return upscalerInstance;
}

/**
 * Runs a 2x AI super-resolution pass (ESRGAN, via UpscalerJS/TensorFlow.js,
 * entirely in-browser) over `file` and returns the result as a PNG blob.
 * Intended to run on the pre-removal original photo — upscaling the already
 * cut-out subject would feed the model transparent-edge pixels it wasn't
 * trained on — with the caller re-running background removal on the result.
 */
export async function upscaleImage(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  const dataUrl = await getUpscaler().upscale(canvas);

  const response = await fetch(dataUrl);
  return response.blob();
}
