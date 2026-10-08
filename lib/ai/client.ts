import { taskOf, type AiTask, type JobRequest, type MagicPoint, type WorkerRequest, type WorkerResponse } from "./protocol";

interface PendingRequest {
  /** Kept to replay the job on a fresh worker after a WebGPU failure. */
  message: JobRequest;
  resolve: (result: Answer) => void;
  reject: (error: Error) => void;
  onProgress?: (ratio: number) => void;
}

type Answer = Extract<WorkerResponse, { type: "done" | "mask" | "inpainted" }>;

const TASKS: AiTask[] = ["segment", "upscale", "sam", "inpaint"];

/**
 * Remembers, per task, a GPU that failed mid-inference, so later visits skip
 * WebGPU for that task outright. Per task because one model can hit a GPU
 * limit another one fits in (e.g. upscaling fails where segmentation works).
 */
const webGpuBrokenKey = (task: AiTask) => `quitafondo:webgpu-broken:${task}`;

let worker: Worker | null = null;
const wasmOnlyTasks = new Set<AiTask>(TASKS.filter(readWebGpuBroken));
let nextId = 0;
const pending = new Map<number, PendingRequest>();

function readWebGpuBroken(task: AiTask): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(webGpuBrokenKey(task)) === "1";
  } catch {
    return false;
  }
}

function rememberWebGpuBroken(task: AiTask): void {
  wasmOnlyTasks.add(task);
  try {
    localStorage.setItem(webGpuBrokenKey(task), "1");
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
 * All AI models run in one shared Web Worker so inference (and the one-time
 * model downloads) never blocks the editor's main thread. It is created
 * lazily, on the first job, so merely opening the page downloads nothing.
 */
function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./ai.worker.ts", import.meta.url), { type: "module" });
  for (const task of wasmOnlyTasks) send(created, { type: "force-wasm", task });
  created.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const request = pending.get(message.id);
    if (message.type === "gpu-failed") {
      // The old worker is unusable; every job it still held (this one
      // included) is replayed on a fresh worker that runs this task on WASM.
      if (request) rememberWebGpuBroken(taskOf(request.message));
      discardWorker();
      const replacement = getWorker();
      for (const { message: job } of pending.values()) send(replacement, job);
      return;
    }
    if (!request) return;
    if (message.type === "progress") {
      request.onProgress?.(message.ratio);
      return;
    }
    pending.delete(message.id);
    if (message.type === "error") {
      request.reject(new Error(message.message));
      return;
    }
    request.onProgress?.(1);
    request.resolve(message);
  };
  created.onerror = (event) => {
    const error = new Error(event.message || "El proceso de IA falló.");
    for (const request of pending.values()) request.reject(error);
    pending.clear();
    discardWorker();
  };
  worker = created;
  return created;
}

function submit(build: (id: number) => JobRequest, onProgress?: (ratio: number) => void): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const message = build(nextId++);
    pending.set(message.id, { message, resolve, reject, onProgress });
    send(getWorker(), message);
  });
}

/** Removes the background ("segment") or upscales 2x ("upscale") in the AI worker; resolves with a PNG. */
export async function runAiTask(
  task: "segment" | "upscale",
  image: Blob,
  onProgress?: (ratio: number) => void
): Promise<Blob> {
  const response = await submit((id) => ({ type: "run", task, id, image }), onProgress);
  if (response.type !== "done") throw new Error("Respuesta inesperada del proceso de IA.");
  return response.result;
}

/**
 * Magic selection: candidate object masks (0/255 per pixel, at the image's
 * size, smallest to largest) for the clicked points, plus the most confident
 * one's index. With `points: null` it only prepares the image (the slow,
 * once-per-image step) and resolves with no masks.
 */
export async function runMagicSelect(
  key: string,
  image: Blob,
  points: MagicPoint[] | null,
  onProgress?: (ratio: number) => void
): Promise<{ masks: Uint8Array[]; best: number; width: number; height: number }> {
  const response = await submit((id) => ({ type: "sam", id, key, image, points }), onProgress);
  if (response.type !== "mask") throw new Error("Respuesta inesperada del proceso de IA.");
  return { masks: response.masks, best: response.best, width: response.width, height: response.height };
}

/**
 * Magic eraser: fills what `mask` marks (non-zero, one byte per photo pixel)
 * and resolves with the cleaned photo and the cutout recolored from it.
 */
export async function runInpaint(
  image: Blob,
  cutout: Blob,
  mask: Uint8Array,
  width: number,
  height: number,
  onProgress?: (ratio: number) => void
): Promise<{ original: Blob; cutout: Blob }> {
  // The mask is copied, not transferred: a pending job may be replayed on a new worker.
  const response = await submit((id) => ({ type: "inpaint", id, image, cutout, mask, width, height }), onProgress);
  if (response.type !== "inpainted") throw new Error("Respuesta inesperada del proceso de IA.");
  return { original: response.original, cutout: response.cutout };
}
