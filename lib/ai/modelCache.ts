import { INPAINT_MODEL_URL } from "./protocol";

/** Cache Storage bucket where the worker keeps the big model files it downloads itself (LaMa). */
export const MODEL_CACHE_NAME = "quitafondo-models";

/** Buckets Transformers.js uses for the other models; cleared together with ours. */
const LIBRARY_CACHE_NAMES = ["transformers-cache"];

function hasCacheStorage(): boolean {
  return typeof caches !== "undefined";
}

/** True when the model at `url` is already stored on this device, so using it needs no download. */
export async function isModelCached(url: string = INPAINT_MODEL_URL): Promise<boolean> {
  if (!hasCacheStorage()) return false;
  try {
    return Boolean(await caches.match(url, { cacheName: MODEL_CACHE_NAME }));
  } catch {
    return false;
  }
}

/** Deletes every downloaded AI model from this device. Returns how many caches were removed. */
export async function clearModelCache(): Promise<number> {
  if (!hasCacheStorage()) return 0;
  let removed = 0;
  for (const name of [MODEL_CACHE_NAME, ...LIBRARY_CACHE_NAMES]) {
    try {
      if (await caches.delete(name)) removed++;
    } catch {
      // Blocked storage: nothing to clear.
    }
  }
  return removed;
}

/** Substrings of the Hugging Face URLs of the cutout models Transformers.js keeps in its own cache. */
const SEGMENT_MODEL_MARKERS = ["BiRefNet_lite-ONNX", "isnet-general-onnx", "BEN2-ONNX"];

/** True when a cutout model's files are already on this device, so removing a background needs no download. */
export async function isSegmentModelCached(): Promise<boolean> {
  if (!hasCacheStorage()) return false;
  try {
    const cache = await caches.open("transformers-cache");
    const keys = await cache.keys();
    return keys.some((request) => SEGMENT_MODEL_MARKERS.some((marker) => request.url.includes(marker)));
  } catch {
    return false;
  }
}
