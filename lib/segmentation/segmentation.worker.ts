/// <reference lib="webworker" />
import { pipeline, RawImage, type BackgroundRemovalPipeline } from "@huggingface/transformers";
import {
  COMPATIBLE_MODEL,
  DOWNLOAD_PROGRESS_SHARE,
  HIGH_QUALITY_MODEL,
  MIN_STORAGE_BUFFERS_PER_SHADER_STAGE,
  type SegmentationDevice,
  type SegmentationModel,
  type SegmentResponse,
  type WorkerRequest,
} from "./protocol";

declare const self: DedicatedWorkerGlobalScope;

interface GpuAdapterLike {
  limits: { maxStorageBuffersPerShaderStage: number };
}

/** Requests waiting on the model download; every one of them sees its progress. */
const awaitingModel = new Set<number>();
let forceWasm = false;
let segmenterPromise: Promise<{ segmenter: BackgroundRemovalPipeline; device: SegmentationDevice }> | null =
  null;

function post(message: SegmentResponse): void {
  self.postMessage(message);
}

interface Backend {
  device: SegmentationDevice;
  model: SegmentationModel;
}

const WASM_BACKEND: Backend = { device: "wasm", model: COMPATIBLE_MODEL };

/** The best model/device pair this browser can actually run, best first. */
async function pickBackend(): Promise<Backend> {
  if (forceWasm) return WASM_BACKEND;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> } }).gpu;
  if (!gpu) return WASM_BACKEND;
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return WASM_BACKEND;
    const fitsHighQuality =
      adapter.limits.maxStorageBuffersPerShaderStage >= MIN_STORAGE_BUFFERS_PER_SHADER_STAGE;
    return { device: "webgpu", model: fitsHighQuality ? HIGH_QUALITY_MODEL : COMPATIBLE_MODEL };
  } catch {
    return WASM_BACKEND;
  }
}

function load({ device, model }: Backend): Promise<BackgroundRemovalPipeline> {
  console.info(`[QuitaFondo] Cargando ${model.id} en ${device}`);
  return pipeline("background-removal", model.id, {
    device,
    dtype: model.dtype,
    progress_callback: (info) => {
      if (info.status !== "progress_total") return;
      const ratio = (info.progress / 100) * DOWNLOAD_PROGRESS_SHARE;
      for (const id of awaitingModel) post({ id, type: "progress", ratio });
    },
  }) as Promise<BackgroundRemovalPipeline>;
}

function getSegmenter() {
  segmenterPromise ??= (async () => {
    const backend = await pickBackend();
    try {
      return { segmenter: await load(backend), device: backend.device };
    } catch (error) {
      // A WebGPU adapter can pass the checks above yet still fail to build
      // the session (blocklisted driver, missing fp16 support...).
      if (backend.device === "wasm") throw error;
      return { segmenter: await load(WASM_BACKEND), device: WASM_BACKEND.device };
    }
  })().catch((error) => {
    // Let the next request retry (e.g. after a dropped connection mid-download).
    segmenterPromise = null;
    throw error;
  });
  return segmenterPromise;
}

async function encodePng(image: RawImage): Promise<Blob> {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el lienzo para exportar el recorte.");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

/** Resolves `false` when WebGPU failed mid-inference and the client must swap workers. */
async function segment(id: number, image: Blob): Promise<boolean> {
  awaitingModel.add(id);
  let loaded;
  try {
    loaded = await getSegmenter();
  } finally {
    awaitingModel.delete(id);
  }
  post({ id, type: "progress", ratio: DOWNLOAD_PROGRESS_SHARE });

  let output: RawImage;
  try {
    output = (await loaded.segmenter(await RawImage.fromBlob(image))) as RawImage;
  } catch (error) {
    if (loaded.device !== "webgpu") throw error;
    post({ id, type: "gpu-failed" });
    return false;
  }
  post({ id, type: "done", cutout: await encodePng(output) });
  return true;
}

// One inference at a time: concurrent runs on the same ONNX session are not
// safe on every backend, and they would only compete for the same GPU anyway.
let queue: Promise<boolean> = Promise.resolve(true);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "force-wasm") {
    forceWasm = true;
    return;
  }
  const { id, image } = request;
  // Show the download progress right away, even while queued behind another image.
  if (!segmenterPromise) awaitingModel.add(id);
  queue = queue.then(async (healthy) => {
    // After a WebGPU failure this worker is about to be replaced; anything
    // still queued is re-sent by the client to the new one.
    if (!healthy) return false;
    try {
      return await segment(id, image);
    } catch (error) {
      awaitingModel.delete(id);
      post({
        id,
        type: "error",
        message: error instanceof Error ? error.message : "Error desconocido al quitar el fondo",
      });
      return true;
    }
  });
};
