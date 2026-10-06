import type { BackgroundConfig, CanvasConfig, ExportConfig, ImageJob } from "@/lib/types";
import { DEFAULT_BACKGROUND, DEFAULT_CANVAS, DEFAULT_EXPORT } from "@/lib/types";

/**
 * What actually survives a page reload for one image. Only `done` jobs are
 * worth persisting: `pending`/`processing`/`error` jobs reference a `File`
 * that lives only in memory (`useBatchQueue`'s private ref) and can't be
 * meaningfully resumed after a reload.
 *
 * `originalBlob` — the pre-removal photo's own bytes, NOT derived from
 * `cutoutBlob` — is required, not optional: "Restaurar" needs the real
 * original pixels to recover regions the model erased, and the cutout has no
 * usable color data there. Regenerating `originalUrl` from `cutoutBlob`
 * instead would silently make Restaurar a no-op after every reload.
 */
export interface PersistedJob {
  id: string;
  fileName: string;
  background: BackgroundConfig;
  canvas: CanvasConfig;
  exportConfig: ExportConfig;
  cutoutBlob: Blob;
  originalBlob: Blob;
}

/** `originalBlob` is the actual uploaded file's bytes, kept by the caller
 * (only `useBatchQueue`'s private file map has it) — this function can't
 * reach it on its own. */
export function toPersistedJob(job: ImageJob, originalBlob: Blob): PersistedJob | null {
  if (job.status !== "done" || !job.cutoutBlob) return null;
  return {
    id: job.id,
    fileName: job.fileName,
    background: job.background,
    canvas: job.canvas,
    exportConfig: job.exportConfig,
    cutoutBlob: job.cutoutBlob,
    originalBlob,
  };
}

/** Rehydrates a persisted record into a live `ImageJob`, regenerating
 * `originalUrl` since object URLs never survive a reload.
 *
 * Merges each config over its current defaults rather than trusting the
 * stored shape outright: a record saved by an older build (before, say,
 * `manualScale` existed on `CanvasConfig`) is missing whatever fields were
 * added since, and using it as-is would silently hand `undefined` into a
 * slider or a pixel-math calculation (NaN%, NaN pixels) instead of a sane
 * fallback. IndexedDB carries no built-in schema versioning, so this
 * defensive merge is the only migration story for now.
 */
export function fromPersistedJob(persisted: PersistedJob): ImageJob {
  return {
    id: persisted.id,
    fileName: persisted.fileName,
    originalUrl: URL.createObjectURL(persisted.originalBlob),
    status: "done",
    cutoutBlob: persisted.cutoutBlob,
    background: { ...DEFAULT_BACKGROUND, ...persisted.background },
    canvas: { ...DEFAULT_CANVAS, ...persisted.canvas },
    exportConfig: { ...DEFAULT_EXPORT, ...persisted.exportConfig },
  };
}
