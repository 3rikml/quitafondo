import type { BoundingBox } from "./image/boundingBox";

export type BackgroundConfig =
  | { kind: "transparent" }
  | { kind: "solid"; color: string }
  | { kind: "gradient"; from: string; to: string; angleDeg: number }
  | { kind: "image"; url: string };

export type CanvasPreset = "square" | "portrait-4-5" | "story-9-16" | "original" | "custom";

export interface CanvasConfig {
  preset: CanvasPreset;
  widthPx: number;
  heightPx: number;
  centerSubject: boolean;
  marginPercent: number; // 0-45
  /**
   * Manual nudge (in canvas pixels) applied on top of whatever the automatic
   * fit (centered or contain) computed. Lets the user drag the subject to an
   * exact spot instead of only the auto-centered position.
   */
  offsetX: number;
  offsetY: number;
  /** Manual resize multiplier on top of the automatic fit's scale, anchored
   * on the subject's own center — 1 means "no manual resize". */
  manualScale: number;
  /** Manual rotation in degrees, normalized to (-180, 180], anchored on the
   * subject's own center — 0 means "no rotation". Lets the user straighten a
   * crooked photo (small angles) or spin it a quarter turn (±90/180). */
  rotationDeg: number;
  /**
   * User-drawn crop region, in the cutout's own source-pixel coordinates
   * (same space as the auto-detected alpha bounding box). When set, it
   * replaces the auto-detected bounding box as "the subject" for every fit
   * computation (centering, manual resize anchor) AND everything outside it
   * is clipped from the render — fixing cutouts where the model's alpha
   * bbox is lopsided (a stray semi-transparent fringe on one side throws
   * off centering even though the real subject is fine). `null`/missing
   * (older saved jobs predate this field) means "auto-detect as before".
   */
  cropBox?: BoundingBox | null;
}

export type ExportFormat = "png" | "jpg" | "webp";

export interface ExportConfig {
  format: ExportFormat;
  quality: number; // 1-100, ignored for png
}

export type JobStatus = "pending" | "processing" | "done" | "error";

export interface ImageJob {
  id: string;
  fileName: string;
  originalUrl: string;
  status: JobStatus;
  cutoutBlob?: Blob;
  errorMessage?: string;
  /** 0-1, only meaningful while status === "processing". */
  progress?: number;
  background: BackgroundConfig;
  canvas: CanvasConfig;
  exportConfig: ExportConfig;
}

export const DEFAULT_BACKGROUND: BackgroundConfig = { kind: "transparent" };

export const DEFAULT_CANVAS: CanvasConfig = {
  preset: "original",
  widthPx: 0,
  heightPx: 0,
  centerSubject: false,
  marginPercent: 5,
  offsetX: 0,
  offsetY: 0,
  manualScale: 1,
  rotationDeg: 0,
  cropBox: null,
};

export const DEFAULT_EXPORT: ExportConfig = { format: "png", quality: 92 };
