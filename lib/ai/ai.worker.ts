/// <reference lib="webworker" />
import {
  pipeline,
  RawImage,
  type BackgroundRemovalPipeline,
  type ImageToImagePipeline,
} from "@huggingface/transformers";
import {
  COMPATIBLE_MODEL,
  DOWNLOAD_PROGRESS_SHARE,
  HIGH_QUALITY_MODEL,
  MIN_STORAGE_BUFFERS_PER_SHADER_STAGE,
  UPSCALE_MODELS,
  type AiDevice,
  type AiModel,
  type AiTask,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";
import { computeTiles, pasteTile } from "./tiling";

declare const self: DedicatedWorkerGlobalScope;

interface GpuAdapterLike {
  limits: { maxStorageBuffersPerShaderStage: number };
}

interface Backend {
  device: AiDevice;
  model: AiModel;
}

type Runner = BackgroundRemovalPipeline | ImageToImagePipeline;

/** Swin2SR tile size and overlap, in input pixels (multiples of its 8 px window). */
const UPSCALE_TILE = 256;
const UPSCALE_OVERLAP = 16;
const UPSCALE_FACTOR = 2;

/** Requests waiting on a model download, per task; each of them sees its progress. */
const awaitingModel: Record<AiTask, Set<number>> = { segment: new Set(), upscale: new Set() };
const runners = new Map<AiTask, Promise<{ runner: Runner; device: AiDevice }>>();
/** Tasks whose WebGPU run failed before (told by the client): WASM only. */
const wasmOnlyTasks = new Set<AiTask>();

function post(message: WorkerResponse): void {
  self.postMessage(message);
}

async function getAdapter(task: AiTask): Promise<GpuAdapterLike | null> {
  if (wasmOnlyTasks.has(task)) return null;
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<GpuAdapterLike | null> } }).gpu;
  try {
    return (await gpu?.requestAdapter()) ?? null;
  } catch {
    return null;
  }
}

/** The best model/device pair this browser can run for `task`, best first. */
async function pickBackend(task: AiTask): Promise<Backend> {
  const adapter = await getAdapter(task);
  if (task === "upscale") {
    return adapter ? { device: "webgpu", model: UPSCALE_MODELS.webgpu } : { device: "wasm", model: UPSCALE_MODELS.wasm };
  }
  if (!adapter) return { device: "wasm", model: COMPATIBLE_MODEL };
  const fitsHighQuality = adapter.limits.maxStorageBuffersPerShaderStage >= MIN_STORAGE_BUFFERS_PER_SHADER_STAGE;
  return { device: "webgpu", model: fitsHighQuality ? HIGH_QUALITY_MODEL : COMPATIBLE_MODEL };
}

function wasmBackend(task: AiTask): Backend {
  return { device: "wasm", model: task === "upscale" ? UPSCALE_MODELS.wasm : COMPATIBLE_MODEL };
}

function load(task: AiTask, { device, model }: Backend): Promise<Runner> {
  console.info(`[QuitaFondo] Cargando ${model.id} en ${device}`);
  const progress_callback = (info: { status: string; progress?: number }) => {
    if (info.status !== "progress_total" || info.progress === undefined) return;
    const ratio = (info.progress / 100) * DOWNLOAD_PROGRESS_SHARE[task];
    for (const id of awaitingModel[task]) post({ id, type: "progress", ratio });
  };
  const options = { device, dtype: model.dtype, progress_callback };
  return task === "segment"
    ? (pipeline("background-removal", model.id, options) as Promise<BackgroundRemovalPipeline>)
    : (pipeline("image-to-image", model.id, options) as Promise<ImageToImagePipeline>);
}

function getRunner(task: AiTask) {
  let promise = runners.get(task);
  if (!promise) {
    promise = (async () => {
      const backend = await pickBackend(task);
      try {
        return { runner: await load(task, backend), device: backend.device };
      } catch (error) {
        // A WebGPU adapter can pass the checks above yet still fail to build
        // the session (blocklisted driver, missing fp16 support...).
        if (backend.device === "wasm") throw error;
        return { runner: await load(task, wasmBackend(task)), device: "wasm" as const };
      }
    })().catch((error) => {
      // Let the next request retry (e.g. after a dropped connection mid-download).
      runners.delete(task);
      throw error;
    });
    runners.set(task, promise);
  }
  return promise;
}

async function encodePng(data: Uint8ClampedArray, width: number, height: number): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el lienzo para exportar la imagen.");
  ctx.putImageData(new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

async function segment(runner: BackgroundRemovalPipeline, image: Blob): Promise<Blob> {
  const output = (await runner(await RawImage.fromBlob(image))) as RawImage;
  return encodePng(new Uint8ClampedArray(output.data), output.width, output.height);
}

/** Upscales tile by tile so memory stays bounded whatever the photo size. */
async function upscale(id: number, runner: ImageToImagePipeline, image: Blob): Promise<Blob> {
  const input = (await RawImage.fromBlob(image)).rgb();
  const outWidth = input.width * UPSCALE_FACTOR;
  const outHeight = input.height * UPSCALE_FACTOR;
  const output = new Uint8ClampedArray(outWidth * outHeight * 4);
  const tiles = computeTiles(input.width, input.height, UPSCALE_TILE, UPSCALE_OVERLAP);
  const share = DOWNLOAD_PROGRESS_SHARE.upscale;

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const crop = await input.crop([tile.x, tile.y, tile.x + tile.width - 1, tile.y + tile.height - 1]);
    const result = (await runner(crop)) as RawImage;
    pasteTile(output, outWidth, tile, result.data, result.width, result.channels, UPSCALE_FACTOR);
    post({ id, type: "progress", ratio: share + ((i + 1) / tiles.length) * (1 - share) });
  }
  return encodePng(output, outWidth, outHeight);
}

/** Resolves `false` when WebGPU failed mid-inference and the client must swap workers. */
async function run(task: AiTask, id: number, image: Blob): Promise<boolean> {
  awaitingModel[task].add(id);
  let loaded;
  try {
    loaded = await getRunner(task);
  } finally {
    awaitingModel[task].delete(id);
  }
  post({ id, type: "progress", ratio: DOWNLOAD_PROGRESS_SHARE[task] });

  let result: Blob;
  try {
    result =
      task === "segment"
        ? await segment(loaded.runner as BackgroundRemovalPipeline, image)
        : await upscale(id, loaded.runner as ImageToImagePipeline, image);
  } catch (error) {
    if (loaded.device !== "webgpu") throw error;
    post({ id, type: "gpu-failed" });
    return false;
  }
  post({ id, type: "done", result });
  return true;
}

// One job at a time: concurrent runs on the same ONNX session are not safe
// on every backend, and they would only compete for the same GPU anyway.
let queue: Promise<boolean> = Promise.resolve(true);

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "force-wasm") {
    wasmOnlyTasks.add(request.task);
    return;
  }
  const { task, id, image } = request;
  // Show the download progress right away, even while queued behind another job.
  if (!runners.has(task)) awaitingModel[task].add(id);
  queue = queue.then(async (healthy) => {
    // After a WebGPU failure this worker is about to be replaced; anything
    // still queued is re-sent by the client to the new one.
    if (!healthy) return false;
    try {
      return await run(task, id, image);
    } catch (error) {
      awaitingModel[task].delete(id);
      post({ id, type: "error", message: error instanceof Error ? error.message : "Error desconocido en el proceso de IA" });
      return true;
    }
  });
};
