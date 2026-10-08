import { ensureSupportedImageFormat } from "@/lib/image/formatConversion";
import { runAiTask } from "@/lib/ai/client";

/**
 * Largest photo "Mejorar calidad" accepts (~1000x1000, upscaled to ~2000x2000).
 * Beyond that a photo already has a good resolution, and since the model
 * takes ~3 s per 224 px tile, a 12 MP photo would take many minutes.
 */
export const MAX_UPSCALE_PIXELS = 1_000_000;

/**
 * Runs a 2x AI super-resolution pass (Swin2SR, in the AI worker, tile by
 * tile) over `file` and returns the result as a PNG blob. Intended for the
 * pre-removal original photo — upscaling the already cut-out subject would
 * feed the model transparent-edge pixels it wasn't trained on — with the
 * caller re-running background removal on the result.
 */
export async function upscaleImage(file: File | Blob, onProgress?: (ratio: number) => void): Promise<Blob> {
  return runAiTask("upscale", await ensureSupportedImageFormat(file), onProgress);
}
