import type { AiTask, WorkerRequest, WorkerResponse } from "./protocol";

interface PendingRequest {
  task: AiTask;
  image: Blob;
  resolve: (result: Blob) => void;
  reject: (error: Error) => void;
  onProgress?: (ratio: number) => void;
}

const TASKS: AiTask[] = ["segment", "upscale"];

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
    if (message.type === "gpu-failed") {
      // The old worker is unusable; every request it still held (this one
      // included) is replayed on a fresh worker that runs this task on WASM.
      const failedTask = pending.get(message.id)?.task;
      if (failedTask) rememberWebGpuBroken(failedTask);
      discardWorker();
      const replacement = getWorker();
      for (const [id, request] of pending) {
        send(replacement, { type: "run", task: request.task, id, image: request.image });
      }
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
      request.resolve(message.result);
    } else {
      request.reject(new Error(message.message));
    }
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

/** Runs one AI task in the shared worker; `onProgress` receives 0-1. */
export function runAiTask(task: AiTask, image: Blob, onProgress?: (ratio: number) => void): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { task, image, resolve, reject, onProgress });
    send(getWorker(), { type: "run", task, id, image });
  });
}
