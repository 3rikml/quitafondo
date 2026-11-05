import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("../modelCache", () => ({ isSegmentModelCached: vi.fn().mockResolvedValue(false) }));

import { isSegmentModelCached } from "../modelCache";
import {
  answerDownloadConsent,
  ensureModelDownloadConsent,
  isDownloadConsentOpen,
  needsDownloadConsent,
} from "../downloadConsent";

describe("needsDownloadConsent", () => {
  it("asks only on a limited device with no stored model and no earlier yes", () => {
    expect(needsDownloadConsent({ constrained: true, cached: false, agreed: false })).toBe(true);
    expect(needsDownloadConsent({ constrained: false, cached: false, agreed: false })).toBe(false);
    expect(needsDownloadConsent({ constrained: true, cached: true, agreed: false })).toBe(false);
    expect(needsDownloadConsent({ constrained: true, cached: false, agreed: true })).toBe(false);
  });
});

describe("ensureModelDownloadConsent", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves true at once on a capable device", async () => {
    vi.stubGlobal("navigator", { deviceMemory: 8 });
    await expect(ensureModelDownloadConsent()).resolves.toBe(true);
    expect(isDownloadConsentOpen()).toBe(false);
  });

  it("waits for the answer on a limited device, and remembers a yes", async () => {
    vi.stubGlobal("navigator", { deviceMemory: 2 });
    vi.mocked(isSegmentModelCached).mockResolvedValue(false);
    const first = ensureModelDownloadConsent();
    const second = ensureModelDownloadConsent();
    await vi.waitFor(() => expect(isDownloadConsentOpen()).toBe(true));
    answerDownloadConsent(true);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
    expect(isDownloadConsentOpen()).toBe(false);
    // Already agreed: no second question.
    await expect(ensureModelDownloadConsent()).resolves.toBe(true);
    expect(isDownloadConsentOpen()).toBe(false);
  });
});
