// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const removeImageBackground = vi.fn();
vi.mock("@/hooks/useBackgroundRemoval", () => ({ removeImageBackground: (...a: unknown[]) => removeImageBackground(...a) }));
vi.mock("@/lib/image/downscale", () => ({ downscaleIfHuge: async () => null }));
vi.mock("@/lib/storage/db", () => ({
  saveJob: vi.fn(),
  loadAllJobs: async () => [],
  deleteJob: vi.fn(),
}));

import { useBatchQueue } from "../useBatchQueue";

const png = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: "image/png" });

beforeEach(() => {
  removeImageBackground.mockReset();
  URL.createObjectURL = vi.fn(() => "blob:fake");
  URL.revokeObjectURL = vi.fn();
});

describe("useBatchQueue", () => {
  it("processes a valid file to done", async () => {
    removeImageBackground.mockResolvedValue(new Blob(["cutout"]));
    const { result } = renderHook(() => useBatchQueue());
    act(() => {
      result.current.addFiles([png("a.png")]);
    });
    await waitFor(() => expect(result.current.jobs[0].status).toBe("done"));
    expect(result.current.jobs[0].cutoutBlob).toBeInstanceOf(Blob);
  });

  it("rejects an unsupported file up front without calling the model", async () => {
    const { result } = renderHook(() => useBatchQueue());
    act(() => {
      result.current.addFiles([new File(["x"], "notes.txt", { type: "text/plain" })]);
    });
    expect(result.current.jobs[0].status).toBe("error");
    expect(result.current.jobs[0].errorMessage).toBeTruthy();
    expect(removeImageBackground).not.toHaveBeenCalled();
  });

  it("runs at most two jobs at once and starts the next as one finishes", async () => {
    const resolvers: (() => void)[] = [];
    removeImageBackground.mockImplementation(() => new Promise<Blob>((resolve) => resolvers.push(() => resolve(new Blob(["c"])))));
    const { result } = renderHook(() => useBatchQueue());
    act(() => {
      result.current.addFiles([png("1.png"), png("2.png"), png("3.png")]);
    });
    await waitFor(() => expect(removeImageBackground).toHaveBeenCalledTimes(2));
    expect(result.current.jobs.map((j) => j.status)).toEqual(["processing", "processing", "pending"]);

    await act(async () => resolvers[0]());
    await waitFor(() => expect(removeImageBackground).toHaveBeenCalledTimes(3));
    expect(result.current.jobs[0].status).toBe("done");
  });

  it("shows a friendly message when the model fails and retries successfully", async () => {
    removeImageBackground.mockRejectedValueOnce(new Error("RangeError: Array buffer allocation failed"));
    const { result } = renderHook(() => useBatchQueue());
    act(() => {
      result.current.addFiles([png("big.png")]);
    });
    await waitFor(() => expect(result.current.jobs[0].status).toBe("error"));
    expect(result.current.jobs[0].errorMessage).not.toMatch(/RangeError/);

    removeImageBackground.mockResolvedValue(new Blob(["c"]));
    act(() => result.current.retryJob(result.current.jobs[0].id));
    await waitFor(() => expect(result.current.jobs[0].status).toBe("done"));
  });

  it("removes a job and frees its preview URL", async () => {
    removeImageBackground.mockResolvedValue(new Blob(["c"]));
    const { result } = renderHook(() => useBatchQueue());
    act(() => {
      result.current.addFiles([png("a.png")]);
    });
    await waitFor(() => expect(result.current.jobs[0].status).toBe("done"));
    act(() => result.current.removeJob(result.current.jobs[0].id));
    expect(result.current.jobs).toHaveLength(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
