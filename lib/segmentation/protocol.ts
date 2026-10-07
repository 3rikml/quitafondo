/** Messages exchanged between `hooks/useBackgroundRemoval.ts` and `segmentation.worker.ts`. */

export type SegmentationDevice = "webgpu" | "wasm";

export type WorkerRequest =
  /** Sent once, before any image, to skip WebGPU entirely (see `gpu-failed`). */
  | { type: "force-wasm" }
  | { type: "segment"; id: number; image: Blob };

export type SegmentResponse =
  | { id: number; type: "progress"; ratio: number }
  | { id: number; type: "done"; cutout: Blob }
  | { id: number; type: "error"; message: string }
  /**
   * WebGPU built the session but failed while running it. Once that happens
   * the worker's ONNX Runtime instance stays wedged on the WebGPU kernels
   * (even a fresh WASM session in the same worker hits the same error), so
   * the client must replace the whole worker with a WASM-only one.
   */
  | { id: number; type: "gpu-failed" };

export interface SegmentationModel {
  id: string;
  dtype: "fp16" | "fp32";
}

/**
 * Best quality: BiRefNet_lite (MIT), exported to ONNX by the transformers.js
 * team (~110 MB in fp16). Only usable on WebGPU adapters that meet
 * `MIN_STORAGE_BUFFERS_PER_SHADER_STAGE`; on the CPU (WASM) it exhausts the
 * 4 GB WebAssembly heap even in fp32.
 */
export const HIGH_QUALITY_MODEL: SegmentationModel = {
  id: "onnx-community/BiRefNet_lite-ONNX",
  dtype: "fp16",
};

/**
 * Runs everywhere: IS-Net general-use (DIS, Apache-2.0 weights; MIT-licensed
 * ONNX export by IMG.LY), ~88 MB in fp16. Used on Apple Silicon (whose WebGPU
 * adapter is below BiRefNet's limit) and on the WASM fallback.
 */
export const COMPATIBLE_MODEL: SegmentationModel = {
  id: "imgly/isnet-general-onnx",
  dtype: "fp16",
};

/**
 * BiRefNet's largest WebGPU shader binds 11 storage buffers. Adapters below
 * that (every Apple Silicon Mac reports 10) can never run it.
 */
export const MIN_STORAGE_BUFFERS_PER_SHADER_STAGE = 11;

/** Share of the progress bar given to the one-time model download; inference fills the rest. */
export const DOWNLOAD_PROGRESS_SHARE = 0.9;
