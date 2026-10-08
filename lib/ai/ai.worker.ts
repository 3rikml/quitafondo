/// <reference lib="webworker" />
import {
  AutoProcessor,
  pipeline,
  RawImage,
  SamModel,
  type BackgroundRemovalPipeline,
  type ImageToImagePipeline,
  type Processor,
  type Tensor,
} from "@huggingface/transformers";
import {
  COMPATIBLE_MODEL,
  DOWNLOAD_PROGRESS_SHARE,
  HIGH_QUALITY_MODEL,
  MIN_STORAGE_BUFFERS_PER_SHADER_STAGE,
  SAM_MODELS,
  UPSCALE_MODELS,
  type AiDevice,
  type AiModel,
  type AiTask,
  type MagicPoint,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";
import { computeTiles, pasteTile } from "./tiling";
import { rankMasks } from "./samMask";

declare const self: DedicatedWorkerGlobalScope;

interface GpuAdapterLike {
  limits: { maxStorageBuffersPerShaderStage: number };
}

interface Backend {
  device: AiDevice;
  model: AiModel;
}

interface Sam {
  model: SamModel;
  processor: Processor;
}

interface Loaded<T> {
  value: T;
  device: AiDevice;
}

/** Swin2SR tile size and overlap, in input pixels (multiples of its 8 px window). */
const UPSCALE_TILE = 256;
const UPSCALE_OVERLAP = 16;
const UPSCALE_FACTOR = 2;

/** Requests waiting on a model download, per task; each of them sees its progress. */
const awaitingModel: Record<AiTask, Set<number>> = { segment: new Set(), upscale: new Set(), sam: new Set() };
const loaded = new Map<AiTask, Promise<Loaded<unknown>>>();
/** Tasks whose WebGPU run failed before (told by the client): WASM only. */
const wasmOnlyTasks = new Set<AiTask>();

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
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

function wasmBackend(task: AiTask): Backend {
  if (task === "upscale") return { device: "wasm", model: UPSCALE_MODELS.wasm };
  if (task === "sam") return { device: "wasm", model: SAM_MODELS.wasm };
  return { device: "wasm", model: COMPATIBLE_MODEL };
}

/** The best model/device pair this browser can run for `task`, best first. */
async function pickBackend(task: AiTask): Promise<Backend> {
  const adapter = await getAdapter(task);
  if (!adapter) return wasmBackend(task);
  if (task === "upscale") return { device: "webgpu", model: UPSCALE_MODELS.webgpu };
  if (task === "sam") return { device: "webgpu", model: SAM_MODELS.webgpu };
  const fitsHighQuality = adapter.limits.maxStorageBuffersPerShaderStage >= MIN_STORAGE_BUFFERS_PER_SHADER_STAGE;
  return { device: "webgpu", model: fitsHighQuality ? HIGH_QUALITY_MODEL : COMPATIBLE_MODEL };
}

function load(task: AiTask, { device, model }: Backend): Promise<unknown> {
  console.info(`[QuitaFondo] Cargando ${model.id} en ${device}`);
  const progress_callback = (info: { status: string; progress?: number }) => {
    if (info.status !== "progress_total" || info.progress === undefined) return;
    const ratio = (info.progress / 100) * DOWNLOAD_PROGRESS_SHARE[task];
    for (const id of awaitingModel[task]) post({ id, type: "progress", ratio });
  };
  const options = { device, dtype: model.dtype, progress_callback };
  if (task === "segment") return pipeline("background-removal", model.id, options);
  if (task === "upscale") return pipeline("image-to-image", model.id, options);
  return Promise.all([
    SamModel.from_pretrained(model.id, options),
    AutoProcessor.from_pretrained(model.id, { progress_callback }),
  ]).then(([samModel, processor]): Sam => ({ model: samModel as SamModel, processor }));
}

/** Loads (once) whatever `task` needs, falling back to WASM if the WebGPU session cannot be built. */
async function getLoaded<T>(task: AiTask, id: number): Promise<Loaded<T>> {
  let promise = loaded.get(task);
  if (!promise) {
    promise = (async () => {
      const backend = await pickBackend(task);
      try {
        return { value: await load(task, backend), device: backend.device };
      } catch (error) {
        // A WebGPU adapter can pass the checks above yet still fail to build
        // the session (blocklisted driver, missing fp16 support...).
        if (backend.device === "wasm") throw error;
        return { value: await load(task, wasmBackend(task)), device: "wasm" as const };
      }
    })().catch((error) => {
      // Let the next request retry (e.g. after a dropped connection mid-download).
      loaded.delete(task);
      throw error;
    });
    loaded.set(task, promise);
  }
  awaitingModel[task].add(id);
  try {
    return (await promise) as Loaded<T>;
  } finally {
    awaitingModel[task].delete(id);
  }
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

/** The last image's SAM embedding: the expensive part, reused for every click on that image. */
let samEmbedding: {
  key: string;
  embeddings: Record<string, Tensor>;
  originalSizes: [number, number][];
  reshapedSizes: [number, number][];
} | null = null;

async function samMask(
  { model, processor }: Sam,
  key: string,
  image: Blob,
  points: MagicPoint[] | null
): Promise<{ masks: Uint8Array[]; best: number; width: number; height: number }> {
  if (samEmbedding?.key !== key) {
    const inputs = await processor(await RawImage.fromBlob(image));
    samEmbedding = {
      key,
      embeddings: await model.get_image_embeddings(inputs),
      originalSizes: inputs.original_sizes,
      reshapedSizes: inputs.reshaped_input_sizes,
    };
  }
  const [height, width] = samEmbedding.originalSizes[0];
  if (!points || points.length === 0) return { masks: [], best: 0, width, height };

  const imageProcessor = (processor as unknown as {
    image_processor: {
      reshape_input_points: (points: number[][][], original: [number, number][], reshaped: [number, number][]) => Tensor;
      add_input_labels: (labels: number[][], points: Tensor) => Tensor;
      post_process_masks: (masks: Tensor, original: [number, number][], reshaped: [number, number][]) => Promise<Tensor[]>;
    };
  }).image_processor;
  const inputPoints = imageProcessor.reshape_input_points(
    [points.map((p) => [p.x, p.y])],
    samEmbedding.originalSizes,
    samEmbedding.reshapedSizes
  );
  const inputLabels = imageProcessor.add_input_labels([points.map((p) => (p.positive ? 1 : 0))], inputPoints);
  const outputs = await model({ ...samEmbedding.embeddings, input_points: inputPoints, input_labels: inputLabels });
  const [masks] = await imageProcessor.post_process_masks(
    outputs.pred_masks,
    samEmbedding.originalSizes,
    samEmbedding.reshapedSizes
  );
  // masks: bool [1, 3, height, width]; iou_scores: [1, 1, 3]
  const ranked = rankMasks(masks.data as Uint8Array, masks.dims[1], width, height, outputs.iou_scores.data);
  return { ...ranked, width, height };
}

/** Resolves `false` when WebGPU failed mid-inference and the client must swap workers. */
async function handle(request: Exclude<WorkerRequest, { type: "force-wasm" }>): Promise<boolean> {
  const task: AiTask = request.type === "sam" ? "sam" : request.task;
  const { id } = request;
  const { value, device } = await getLoaded<unknown>(task, id);
  post({ id, type: "progress", ratio: DOWNLOAD_PROGRESS_SHARE[task] });

  try {
    if (request.type === "sam") {
      const result = await samMask(value as Sam, request.key, request.image, request.points);
      post({ id, type: "mask", ...result }, result.masks.map((mask) => mask.buffer));
    } else if (request.task === "segment") {
      post({ id, type: "done", result: await segment(value as BackgroundRemovalPipeline, request.image) });
    } else {
      post({ id, type: "done", result: await upscale(id, value as ImageToImagePipeline, request.image) });
    }
  } catch (error) {
    if (device !== "webgpu") throw error;
    post({ id, type: "gpu-failed" });
    return false;
  }
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
  const task: AiTask = request.type === "sam" ? "sam" : request.task;
  // Show the download progress right away, even while queued behind another job.
  if (!loaded.has(task)) awaitingModel[task].add(request.id);
  queue = queue.then(async (healthy) => {
    // After a WebGPU failure this worker is about to be replaced; anything
    // still queued is re-sent by the client to the new one.
    if (!healthy) return false;
    try {
      return await handle(request);
    } catch (error) {
      awaitingModel[task].delete(request.id);
      post({
        id: request.id,
        type: "error",
        message: error instanceof Error ? error.message : "Error desconocido en el proceso de IA",
      });
      return true;
    }
  });
};
