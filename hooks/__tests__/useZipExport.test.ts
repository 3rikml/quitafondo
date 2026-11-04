// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DEFAULT_BACKGROUND, DEFAULT_CANVAS, DEFAULT_EXPORT, type ImageJob } from "@/lib/types";

const renderJobToBlob = vi.fn();
const buildZipFromBlobs = vi.fn();
vi.mock("@/lib/image/renderJob", () => ({ renderJobToBlob: (...a: unknown[]) => renderJobToBlob(...a) }));
vi.mock("@/lib/image/zipExport", () => ({ buildZipFromBlobs: (...a: unknown[]) => buildZipFromBlobs(...a) }));

import { useZipExport } from "../useZipExport";

const job = (id: string, status: ImageJob["status"] = "done"): ImageJob => ({
  id,
  fileName: `${id}.jpg`,
  originalUrl: "blob:x",
  status,
  cutoutBlob: status === "done" ? new Blob(["c"]) : undefined,
  background: DEFAULT_BACKGROUND,
  canvas: DEFAULT_CANVAS,
  exportConfig: { ...DEFAULT_EXPORT, format: "png" },
});

beforeEach(() => {
  renderJobToBlob.mockReset();
  buildZipFromBlobs.mockReset().mockResolvedValue(new Blob(["zip"]));
  URL.createObjectURL = vi.fn(() => "blob:zip");
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});

describe("useZipExport", () => {
  it("counts only finished images", () => {
    const { result } = renderHook(() => useZipExport([job("a"), job("b", "error"), job("c", "pending")], () => undefined));
    expect(result.current.doneCount).toBe(1);
  });

  it("zips every finished image named after its file and export format", async () => {
    renderJobToBlob.mockResolvedValue(new Blob(["img"]));
    const { result } = renderHook(() => useZipExport([job("a"), job("b")], () => undefined));
    await act(() => result.current.downloadAll());
    expect(buildZipFromBlobs).toHaveBeenCalledWith([
      { name: "a.png", blob: expect.any(Blob) },
      { name: "b.png", blob: expect.any(Blob) },
    ]);
    expect(result.current.error).toBeNull();
    expect(result.current.isZipping).toBe(false);
  });

  it("still zips the rest when one image fails, and reports it", async () => {
    renderJobToBlob.mockRejectedValueOnce(new Error("bad")).mockResolvedValue(new Blob(["img"]));
    const { result } = renderHook(() => useZipExport([job("a"), job("b")], () => undefined));
    await act(() => result.current.downloadAll());
    expect(buildZipFromBlobs).toHaveBeenCalledWith([{ name: "b.png", blob: expect.any(Blob) }]);
    expect(result.current.error).toBeTruthy();
  });

  it("does not build a zip when every image fails", async () => {
    renderJobToBlob.mockRejectedValue(new Error("bad"));
    const { result } = renderHook(() => useZipExport([job("a")], () => undefined));
    await act(() => result.current.downloadAll());
    expect(buildZipFromBlobs).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });
});
