import { ensureSupportedImageFormat } from "@/lib/image/formatConversion";
import type { SegmentResponse, WorkerRequest } from "@/lib/segmentation/protocol";

interface PendingRequest {
  image: Blob;
  resolve: (cutout: Blob) => void;
  reject: (error: Error) => void;
  onProgress?: (ratio: number) => void;
}

/** Remembers a GPU that failed mid-inference, so later visits skip WebGPU outright. */
const WEBGPU_BROKEN_KEY = "quitafondo:webgpu-broken";

let worker: Worker | null = null;
let forceWasm = readWebGpuBroken();
let nextId = 0;
const pending = new Map<number, PendingRequest>();

function readWebGpuBroken(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(WEBGPU_BROKEN_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberWebGpuBroken(): void {
  forceWasm = true;
  try {
    localStorage.setItem(WEBGPU_BROKEN_KEY, "1");
  } catch {
    // Private mode / blocked storage: the in-memory flag still covers this visit.
  }
}

function send(target: Worker, message: WorkerRequest): void {
  target.postMessage(message);
}

function discardWorker(): void {
  worker?.terminate();
  worker = null;
}

/**
 * The model runs in a single shared Web Worker so the multi-second inference
 * (and the one-time ~110 MB download) never blocks the editor's main thread.
 * It is created lazily, on the first image, so merely opening the page
 * downloads nothing.
 */
function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("../lib/segmentation/segmentation.worker.ts", import.meta.url), {
    type: "module",
  });
  if (forceWasm) send(created, { type: "force-wasm" });
  created.onmessage = (event: MessageEvent<SegmentResponse>) => {
    const message = event.data;
    if (message.type === "gpu-failed") {
      // The old worker is unusable; every request it still held (this one
      // included) is replayed on a fresh WASM-only worker.
      rememberWebGpuBroken();
      discardWorker();
      const replacement = getWorker();
      for (const [id, request] of pending) send(replacement, { type: "segment", id, image: request.image });
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    if (message.type === "progress") {
      request.onProgress?.(message.ratio);
      return;
    }
    pending.delete(message.id);
    if (message.type === "done") {
      request.onProgress?.(1);
      request.resolve(message.cutout);
    } else {
      request.reject(new Error(message.message));
    }
  };
  created.onerror = (event) => {
    const error = new Error(event.message || "El proceso de quitar fondo falló.");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    discardWorker();
  };
  worker = created;
  return created;
}

export async function removeImageBackground(
  file: File | Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const image = await ensureSupportedImageFormat(file);
  return new Promise<Blob>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { image, resolve, reject, onProgress });
    send(getWorker(), { type: "segment", id, image });
  });
}
