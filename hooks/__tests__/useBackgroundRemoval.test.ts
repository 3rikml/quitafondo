import { describe, it, expect, vi, beforeAll } from "vitest";
import type { SegmentResponse, WorkerRequest } from "@/lib/segmentation/protocol";

/** Stands in for segmentation.worker.ts: reports progress, then answers with a fake cutout. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<SegmentResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  forcedWasm = false;
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: WorkerRequest) {
    if (request.type === "force-wasm") {
      this.forcedWasm = true;
      return;
    }
    const { id, image } = request;
    queueMicrotask(async () => {
      const content = await image.text();
      if (content === "broken") {
        this.reply({ id, type: "error", message: "boom" });
      } else if (content === "gpu-only-failure" && !this.forcedWasm) {
        this.reply({ id, type: "gpu-failed" });
      } else {
        this.reply({ id, type: "progress", ratio: 0.5 });
        this.reply({ id, type: "done", cutout: new Blob(["fake-cutout"], { type: "image/png" }) });
      }
    });
  }

  terminate() {
    this.terminated = true;
  }

  private reply(data: SegmentResponse) {
    if (!this.terminated) this.onmessage?.({ data } as MessageEvent<SegmentResponse>);
  }
}

beforeAll(() => {
  vi.stubGlobal("Worker", FakeWorker);
});

import { removeImageBackground } from "../useBackgroundRemoval";

describe("removeImageBackground", () => {
  it("resolves with the cutout returned by the worker", async () => {
    const file = new Blob(["fake-source"], { type: "image/png" });
    const result = await removeImageBackground(file);
    expect(await result.text()).toBe("fake-cutout");
  });

  it("reports progress via the onProgress callback, ending at 1", async () => {
    const file = new Blob(["fake-source"], { type: "image/png" });
    const progressUpdates: number[] = [];
    await removeImageBackground(file, (ratio) => progressUpdates.push(ratio));
    expect(progressUpdates).toEqual([0.5, 1]);
  });

  it("rejects with the worker's error message", async () => {
    const file = new Blob(["broken"], { type: "image/png" });
    await expect(removeImageBackground(file)).rejects.toThrow("boom");
  });

  it("replaces the worker with a WASM-only one when WebGPU fails mid-inference", async () => {
    const before = FakeWorker.instances.length;
    const file = new Blob(["gpu-only-failure"], { type: "image/png" });
    const result = await removeImageBackground(file);
    expect(await result.text()).toBe("fake-cutout");
    expect(FakeWorker.instances.length).toBe(before + 1);
    expect(FakeWorker.instances[before - 1].terminated).toBe(true);
    expect(FakeWorker.instances[before].forcedWasm).toBe(true);
  });
});
