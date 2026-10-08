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
// The exact entry Transformers.js uses, so both share one ONNX Runtime
// instance and the WASM binaries it already configured.
import * as ort from "onnxruntime-web/webgpu";
import {
  COMPATIBLE_MODEL,
  DOWNLOAD_PROGRESS_SHARE,
  HIGH_QUALITY_MODEL,
  INPAINT_MODEL_BYTES,
  INPAINT_MODEL_URL,
  MIN_STORAGE_BUFFERS_PER_SHADER_STAGE,
  SAM_MODELS,
  UPSCALE_MODELS,
  type AiDevice,
  type AiModel,
  type AiTask,
  type JobRequest,
  type MagicPoint,
  type WorkerRequest,
  type WorkerResponse,
  taskOf,
} from "./protocol";
import { computeTiles, pasteTile } from "./tiling";
import { rankMasks } from "./samMask";
import {
  INPAINT_SIZE,
  fromOutputTensor,
  inpaintRegion,
  maskBounds,
  toImageTensor,
  toMaskTensor,
  withAlphaOf,
} from "./inpaintRegion";
import { featherAlpha, shiftEdge } from "../image/edgeRefine";

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
const awaitingModel: Record<AiTask, Set<number>> = {
  segment: new Set(),
  upscale: new Set(),
  sam: new Set(),
  inpaint: new Set(),
};
const INPAINT_BACKEND: Backend = { device: "wasm", model: { id: INPAINT_MODEL_URL, dtype: "fp32" } };
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
  if (task === "inpaint") return INPAINT_BACKEND;
  if (task === "upscale") return { device: "wasm", model: UPSCALE_MODELS.wasm };
  if (task === "sam") return { device: "wasm", model: SAM_MODELS.wasm };
  return { device: "wasm", model: COMPATIBLE_MODEL };
}

/** The best model/device pair this browser can run for `task`, best first. */
async function pickBackend(task: AiTask): Promise<Backend> {
  if (task === "inpaint") return INPAINT_BACKEND; // no WebGPU kernels for its FFT layers
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
  if (task === "inpaint") {
    return fetchModel(model.id, INPAINT_MODEL_BYTES, (ratio) => {
      for (const id of awaitingModel.inpaint) post({ id, type: "progress", ratio: ratio * DOWNLOAD_PROGRESS_SHARE.inpaint });
    }).then((bytes) => ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] }));
  }
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

/** Downloads a model file once, reporting progress, and keeps it in Cache Storage for later visits. */
async function fetchModel(url: string, expectedBytes: number, onProgress: (ratio: number) => void): Promise<Uint8Array> {
  const cache = await caches.open("quitafondo-models").catch(() => null);
  const cached = await cache?.match(url);
  if (cached) return new Uint8Array(await cached.arrayBuffer());

  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`No se pudo descargar el modelo (${response.status}).`);
  const total = Number(response.headers.get("content-length")) || expectedBytes;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(1, received / total));
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  await cache?.put(url, new Response(bytes, { headers: { "content-type": "application/octet-stream" } })).catch(() => {});
  return bytes;
}

/**
 * Erases the painted area with LaMa: the region around it (with context) is
 * scaled to 512×512, filled, scaled back and blended in through a slightly
 * grown, feathered copy of the mask, so only the painted area changes.
 */
async function inpaint(
  session: ort.InferenceSession,
  request: Extract<JobRequest, { type: "inpaint" }>
): Promise<{ original: Blob; cutout: Blob }> {
  const { width, height, mask } = request;
  const bounds = maskBounds(mask, width, height);
  if (!bounds) throw new Error("Pinta primero lo que quieres borrar.");
  const region = inpaintRegion(bounds, width, height);
  const photo = await createImageBitmap(request.image);

  // Model inputs: the region of the photo, and the mask grown a little (LaMa
  // fills best when the hole fully covers the object's soft edges).
  const grow = Math.max(2, Math.round((4 * region.width) / INPAINT_SIZE));
  const regionMask = new Uint8ClampedArray(region.width * region.height);
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      regionMask[y * region.width + x] = mask[(region.y + y) * width + region.x + x] ? 255 : 0;
    }
  }
  const hole = shiftEdge(regionMask, region.width, region.height, grow);
  const blend = featherAlpha(hole, region.width, region.height, grow);

  const square = new OffscreenCanvas(INPAINT_SIZE, INPAINT_SIZE);
  const squareCtx = square.getContext("2d")!;
  squareCtx.drawImage(photo, region.x, region.y, region.width, region.height, 0, 0, INPAINT_SIZE, INPAINT_SIZE);
  const imageTensor = toImageTensor(squareCtx.getImageData(0, 0, INPAINT_SIZE, INPAINT_SIZE).data);
  const holeCanvas = new OffscreenCanvas(region.width, region.height);
  const holeRgba = new Uint8ClampedArray(region.width * region.height * 4);
  for (let i = 0; i < hole.length; i++) holeRgba[i * 4 + 3] = hole[i];
  holeCanvas.getContext("2d")!.putImageData(new ImageData(holeRgba, region.width, region.height), 0, 0);
  squareCtx.clearRect(0, 0, INPAINT_SIZE, INPAINT_SIZE);
  squareCtx.drawImage(holeCanvas, 0, 0, INPAINT_SIZE, INPAINT_SIZE);
  const squareMask = squareCtx.getImageData(0, 0, INPAINT_SIZE, INPAINT_SIZE).data;
  const maskAlpha = new Uint8ClampedArray(INPAINT_SIZE * INPAINT_SIZE);
  for (let i = 0; i < maskAlpha.length; i++) maskAlpha[i] = squareMask[i * 4 + 3];

  const [imageName, maskName] = session.inputNames;
  const results = await session.run({
    [imageName]: new ort.Tensor("float32", imageTensor, [1, 3, INPAINT_SIZE, INPAINT_SIZE]),
    [maskName]: new ort.Tensor("float32", toMaskTensor(maskAlpha), [1, 1, INPAINT_SIZE, INPAINT_SIZE]),
  });
  const output = results[session.outputNames[0]].data as Float32Array;

  // Scale the filled square back to the region and blend it in through the feathered mask.
  squareCtx.putImageData(
    new ImageData(fromOutputTensor(output, new Uint8ClampedArray(INPAINT_SIZE * INPAINT_SIZE).fill(255)) as Uint8ClampedArray<ArrayBuffer>, INPAINT_SIZE, INPAINT_SIZE),
    0,
    0
  );
  const patch = new OffscreenCanvas(region.width, region.height);
  const patchCtx = patch.getContext("2d")!;
  patchCtx.imageSmoothingQuality = "high";
  patchCtx.drawImage(square, 0, 0, region.width, region.height);
  const patchPixels = patchCtx.getImageData(0, 0, region.width, region.height);
  for (let i = 0; i < blend.length; i++) patchPixels.data[i * 4 + 3] = blend[i];
  patchCtx.putImageData(patchPixels, 0, 0);

  const full = new OffscreenCanvas(width, height);
  const fullCtx = full.getContext("2d")!;
  fullCtx.drawImage(photo, 0, 0);
  fullCtx.drawImage(patch, region.x, region.y);
  photo.close();
  const original = await full.convertToBlob({ type: "image/png" });

  // Same cutout alpha, colors from the cleaned photo.
  const cutoutBitmap = await createImageBitmap(request.cutout);
  const cutoutCanvas = new OffscreenCanvas(width, height);
  const cutoutCtx = cutoutCanvas.getContext("2d")!;
  cutoutCtx.drawImage(cutoutBitmap, 0, 0);
  cutoutBitmap.close();
  const recolored = withAlphaOf(
    fullCtx.getImageData(0, 0, width, height).data,
    cutoutCtx.getImageData(0, 0, width, height).data
  );
  cutoutCtx.putImageData(new ImageData(recolored as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0);
  return { original, cutout: await cutoutCanvas.convertToBlob({ type: "image/png" }) };
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
async function handle(request: JobRequest): Promise<boolean> {
  const task = taskOf(request);
  const { id } = request;
  const { value, device } = await getLoaded<unknown>(task, id);
  post({ id, type: "progress", ratio: DOWNLOAD_PROGRESS_SHARE[task] });

  try {
    if (request.type === "inpaint") {
      post({ id, type: "inpainted", ...(await inpaint(value as ort.InferenceSession, request)) });
    } else if (request.type === "sam") {
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
  const task = taskOf(request);
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
