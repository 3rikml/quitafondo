import { ensureSupportedImageFormat } from "@/lib/image/formatConversion";
import { runAiTask } from "@/lib/ai/client";
import { retryOnNetworkError } from "@/lib/ai/retry";

/** Removes the background in the AI worker; resolves with a PNG cutout (alpha = subject). */
export async function removeImageBackground(
  file: File | Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const image = await ensureSupportedImageFormat(file);
  // A dropped connection mid-download is retried a couple of times before the person sees an error.
  return retryOnNetworkError(() => runAiTask("segment", image, onProgress));
}
