import { ensureSupportedImageFormat } from "@/lib/image/formatConversion";
import { runAiTask } from "@/lib/ai/client";

/** Removes the background in the AI worker; resolves with a PNG cutout (alpha = subject). */
export async function removeImageBackground(
  file: File | Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  return runAiTask("segment", await ensureSupportedImageFormat(file), onProgress);
}
