/** Messages exchanged between `lib/ai/client.ts` and `ai.worker.ts`. */

export type AiDevice = "webgpu" | "wasm";

/** "segment": remove the background (PNG with alpha). "upscale": 2x super-resolution (PNG). */
export type AiTask = "segment" | "upscale";

export type WorkerRequest =
  /** Sent before any job to run `task` on WASM only (see `gpu-failed`). */
  | { type: "force-wasm"; task: AiTask }
  | { type: "run"; task: AiTask; id: number; image: Blob };

export type WorkerResponse =
  | { id: number; type: "progress"; ratio: number }
  | { id: number; type: "done"; result: Blob }
  | { id: number; type: "error"; message: string }
  /**
   * WebGPU built the session but failed while running it. Once that happens
   * the worker's ONNX Runtime instance stays wedged on the WebGPU kernels
   * (even a fresh WASM session in the same worker hits the same error), so
   * the client must replace the whole worker, running that task on WASM.
   */
  | { id: number; type: "gpu-failed" };

export interface AiModel {
  id: string;
  dtype: "fp16" | "fp32" | "q8";
}

/**
 * Best quality: BiRefNet_lite (MIT), exported to ONNX by the transformers.js
 * team (~110 MB in fp16). Only usable on WebGPU adapters that meet
 * `MIN_STORAGE_BUFFERS_PER_SHADER_STAGE`; on the CPU (WASM) it exhausts the
 * 4 GB WebAssembly heap even in fp32.
 */
export const HIGH_QUALITY_MODEL: AiModel = {
  id: "onnx-community/BiRefNet_lite-ONNX",
  dtype: "fp16",
};

/**
 * Runs everywhere: IS-Net general-use (DIS, Apache-2.0 weights; MIT-licensed
 * ONNX export by IMG.LY), ~88 MB in fp16. Used on Apple Silicon (whose WebGPU
 * adapter is below BiRefNet's limit) and on the WASM fallback.
 */
export const COMPATIBLE_MODEL: AiModel = {
  id: "imgly/isnet-general-onnx",
  dtype: "fp16",
};

/**
 * 2x super-resolution: Swin2SR lightweight (Apache-2.0), ONNX export by the
 * transformers.js team, ~8 MB. The "classical" variant looks marginally
 * sharper but took ~11 s per 256 px tile even on an Apple GPU — minutes for
 * an ordinary photo — so the lightweight one is the practical choice. fp32
 * everywhere: at this size quantizing saves almost nothing.
 */
export const UPSCALE_MODELS: Record<AiDevice, AiModel> = {
  webgpu: { id: "Xenova/swin2SR-lightweight-x2-64", dtype: "fp32" },
  wasm: { id: "Xenova/swin2SR-lightweight-x2-64", dtype: "fp32" },
};

/**
 * BiRefNet's largest WebGPU shader binds 11 storage buffers. Adapters below
 * that (every Apple Silicon Mac reports 10) can never run it.
 */
export const MIN_STORAGE_BUFFERS_PER_SHADER_STAGE = 11;

/**
 * Share of each task's progress bar given to the one-time model download;
 * the work itself fills the rest. Upscaling spends most of its time on the
 * per-tile inference, so its download gets a smaller slice.
 */
export const DOWNLOAD_PROGRESS_SHARE: Record<AiTask, number> = {
  segment: 0.9,
  upscale: 0.3,
};
