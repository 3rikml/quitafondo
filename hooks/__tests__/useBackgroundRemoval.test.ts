import { describe, it, expect, vi } from "vitest";

vi.mock("@imgly/background-removal", () => ({
  removeBackground: vi.fn(async (_file: unknown, options?: { progress?: (key: string, current: number, total: number) => void }) => {
    options?.progress?.("compute:inference", 1, 1);
    return new Blob(["fake-cutout"], { type: "image/png" });
  }),
}));

import { removeImageBackground } from "../useBackgroundRemoval";

describe("removeImageBackground", () => {
  it("resolves with the blob returned by the underlying library", async () => {
    const file = new Blob(["fake-source"], { type: "image/png" });
    const result = await removeImageBackground(file);
    expect(await result.text()).toBe("fake-cutout");
  });

  it("reports progress via the onProgress callback", async () => {
    const file = new Blob(["fake-source"], { type: "image/png" });
    const progressUpdates: number[] = [];
    await removeImageBackground(file, (ratio) => progressUpdates.push(ratio));
    expect(progressUpdates).toContain(1);
  });
});
