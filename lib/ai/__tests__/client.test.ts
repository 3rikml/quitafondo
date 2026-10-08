import { describe, it, expect, vi, beforeAll } from "vitest";
import type { WorkerResponse, WorkerRequest } from "@/lib/ai/protocol";

/** Stands in for ai.worker.ts: reports progress, then answers with a fake result. */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  wasmOnly = new Set<string>();
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: WorkerRequest) {
    if (request.type === "force-wasm") {
      this.wasmOnly.add(request.task);
      return;
    }
    const { id, image, task } = request;
    queueMicrotask(async () => {
      const content = await image.text();
      if (content === "broken") {
        this.reply({ id, type: "error", message: "boom" });
      } else if (content === "gpu-only-failure" && !this.wasmOnly.has(task)) {
        this.reply({ id, type: "gpu-failed" });
      } else {
        this.reply({ id, type: "progress", ratio: 0.5 });
        this.reply({ id, type: "done", result: new Blob([`fake-${task}`], { type: "image/png" }) });
      }
    });
  }

  terminate() {
    this.terminated = true;
  }

  private reply(data: WorkerResponse) {
    if (!this.terminated) this.onmessage?.({ data } as MessageEvent<WorkerResponse>);
  }
}

beforeAll(() => {
  vi.stubGlobal("Worker", FakeWorker);
});

import { runAiTask } from "../client";

describe("runAiTask", () => {
  it("resolves with the result the worker returns for each task", async () => {
    const file = new Blob(["fake-source"], { type: "image/png" });
    expect(await (await runAiTask("segment", file)).text()).toBe("fake-segment");
    expect(await (await runAiTask("upscale", file)).text()).toBe("fake-upscale");
  });

  it("reports progress via the onProgress callback, ending at 1", async () => {
    const file = new Blob(["fake-source"], { type: "image/png" });
    const progressUpdates: number[] = [];
    await runAiTask("segment", file, (ratio) => progressUpdates.push(ratio));
    expect(progressUpdates).toEqual([0.5, 1]);
  });

  it("rejects with the worker's error message", async () => {
    const file = new Blob(["broken"], { type: "image/png" });
    await expect(runAiTask("segment", file)).rejects.toThrow("boom");
  });

  it("swaps in a new worker that runs only the failed task on WASM", async () => {
    const before = FakeWorker.instances.length;
    const file = new Blob(["gpu-only-failure"], { type: "image/png" });
    const result = await runAiTask("upscale", file);
    expect(await result.text()).toBe("fake-upscale");
    expect(FakeWorker.instances.length).toBe(before + 1);
    expect(FakeWorker.instances[before - 1].terminated).toBe(true);
    const replacement = FakeWorker.instances[before];
    expect(replacement.wasmOnly.has("upscale")).toBe(true);
    expect(replacement.wasmOnly.has("segment")).toBe(false);
  });
});
