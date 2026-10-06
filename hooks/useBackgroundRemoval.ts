import { removeBackground } from "@imgly/background-removal";
import { ensureSupportedImageFormat } from "@/lib/image/formatConversion";

export async function removeImageBackground(
  file: File | Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const decodable = await ensureSupportedImageFormat(file);
  return removeBackground(decodable, {
    // Full-precision ISNet ("large" in the library's own docs, but the type
    // only exposes the underlying model id) instead of the fp16 default: a
    // noticeably cleaner cutout (finer hair/edge detail, fewer stray alpha
    // holes) at the cost of a larger model download and slower inference.
    model: "isnet",
    // Runs on WebGPU when the browser supports it (the library probes for
    // support and falls back to WASM/CPU automatically otherwise), offsetting
    // the heavier model's cost.
    device: "gpu",
    progress: (_key, current, total) => {
      if (onProgress && total > 0) {
        onProgress(current / total);
      }
    },
  });
}
