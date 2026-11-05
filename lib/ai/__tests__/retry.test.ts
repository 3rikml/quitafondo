import { describe, it, expect, vi } from "vitest";
import { retryOnNetworkError } from "../retry";

describe("retryOnNetworkError", () => {
  it("returns the first success without waiting", async () => {
    const task = vi.fn().mockResolvedValue("ok");
    await expect(retryOnNetworkError(task, { delayMs: 0 })).resolves.toBe("ok");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("retries a dropped connection and then succeeds", async () => {
    const task = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValue("ok");
    await expect(retryOnNetworkError(task, { delayMs: 0 })).resolves.toBe("ok");
    expect(task).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retries and throws the last error", async () => {
    const task = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(retryOnNetworkError(task, { retries: 2, delayMs: 0 })).rejects.toThrow("Failed to fetch");
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("does not retry other errors", async () => {
    const task = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(retryOnNetworkError(task, { delayMs: 0 })).rejects.toThrow("boom");
    expect(task).toHaveBeenCalledTimes(1);
  });
});
