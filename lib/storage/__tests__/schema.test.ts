import { describe, it, expect, vi, beforeEach } from "vitest";
import { toPersistedJob, fromPersistedJob, type PersistedJob } from "../schema";
import { DEFAULT_BACKGROUND, DEFAULT_CANVAS, DEFAULT_EXPORT, type ImageJob } from "@/lib/types";

function makeJob(overrides: Partial<ImageJob> = {}): ImageJob {
  return {
    id: "job-1",
    fileName: "photo.png",
    originalUrl: "blob:original",
    status: "done",
    cutoutBlob: new Blob(["cutout"], { type: "image/png" }),
    background: DEFAULT_BACKGROUND,
    canvas: DEFAULT_CANVAS,
    exportConfig: DEFAULT_EXPORT,
    ...overrides,
  };
}

describe("toPersistedJob", () => {
  it("returns null for jobs that are not done", () => {
    expect(toPersistedJob(makeJob({ status: "pending", cutoutBlob: undefined }), new Blob())).toBeNull();
    expect(toPersistedJob(makeJob({ status: "processing", cutoutBlob: undefined }), new Blob())).toBeNull();
    expect(toPersistedJob(makeJob({ status: "error", cutoutBlob: undefined }), new Blob())).toBeNull();
  });

  it("returns null for a done job with no cutout blob (defensive — should not happen)", () => {
    expect(toPersistedJob(makeJob({ cutoutBlob: undefined }), new Blob())).toBeNull();
  });

  it("carries the caller-supplied originalBlob, not anything derived from the cutout", () => {
    const originalBlob = new Blob(["original-bytes"], { type: "image/jpeg" });
    const persisted = toPersistedJob(makeJob(), originalBlob);
    expect(persisted?.originalBlob).toBe(originalBlob);
  });

  it("preserves background/canvas/exportConfig and fileName unchanged", () => {
    const job = makeJob({ fileName: "vacation.jpg" });
    const persisted = toPersistedJob(job, new Blob());
    expect(persisted?.fileName).toBe("vacation.jpg");
    expect(persisted?.background).toEqual(job.background);
    expect(persisted?.canvas).toEqual(job.canvas);
    expect(persisted?.exportConfig).toEqual(job.exportConfig);
  });
});

describe("fromPersistedJob", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:rehydrated") });
  });

  it("regenerates originalUrl from originalBlob via createObjectURL", () => {
    const originalBlob = new Blob(["original-bytes"]);
    const persisted = toPersistedJob(makeJob(), originalBlob)!;
    const job = fromPersistedJob(persisted);

    expect(URL.createObjectURL).toHaveBeenCalledWith(originalBlob);
    expect(job.originalUrl).toBe("blob:rehydrated");
  });

  it("round-trips as a status:done job with no error message", () => {
    const persisted = toPersistedJob(makeJob(), new Blob())!;
    const job = fromPersistedJob(persisted);

    expect(job.status).toBe("done");
    expect(job.errorMessage).toBeUndefined();
    expect(job.cutoutBlob).toBe(persisted.cutoutBlob);
    expect(job.background).toEqual(persisted.background);
    expect(job.canvas).toEqual(persisted.canvas);
    expect(job.exportConfig).toEqual(persisted.exportConfig);
  });

  it("fills in a field missing from an older-schema persisted record with its current default", () => {
    // Simulates a record saved before `manualScale` existed on CanvasConfig —
    // IndexedDB has no schema versioning, so this is the actual migration
    // story: fall back to the current default instead of surfacing `undefined`.
    const { manualScale, ...canvasWithoutManualScale } = DEFAULT_CANVAS;
    void manualScale;
    const staleRecord = {
      ...toPersistedJob(makeJob(), new Blob())!,
      canvas: canvasWithoutManualScale,
    } as PersistedJob;

    const job = fromPersistedJob(staleRecord);

    expect(job.canvas.manualScale).toBe(DEFAULT_CANVAS.manualScale);
  });

  it("still prefers the persisted value over the default when the field IS present", () => {
    const persisted = toPersistedJob(makeJob({ canvas: { ...DEFAULT_CANVAS, manualScale: 2.5 } }), new Blob())!;
    const job = fromPersistedJob(persisted);
    expect(job.canvas.manualScale).toBe(2.5);
  });
});
