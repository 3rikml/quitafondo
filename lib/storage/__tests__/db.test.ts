import "fake-indexeddb/auto";
import { describe, it, expect } from "vitest";
import { saveJob, loadAllJobs, deleteJob, saveSelectedJobId, loadSelectedJobId } from "../db";
import type { PersistedJob } from "../schema";
import { DEFAULT_BACKGROUND, DEFAULT_CANVAS, DEFAULT_EXPORT } from "@/lib/types";

function makePersisted(id: string): PersistedJob {
  return {
    id,
    fileName: `${id}.png`,
    background: DEFAULT_BACKGROUND,
    canvas: DEFAULT_CANVAS,
    exportConfig: DEFAULT_EXPORT,
    cutoutBlob: new Blob(["cutout"], { type: "image/png" }),
    originalBlob: new Blob(["original"], { type: "image/jpeg" }),
  };
}

// Each `indexedDB.deleteDatabase` call is async and the module caches its DB
// connection, so re-import the module fresh per test via vi.resetModules
// would be the "correct" isolation — but since every job record is keyed by
// its own unique id here, running tests against the same persisted DB
// instance across this file is simpler and just as reliable.
describe("db (jobs store)", () => {
  it("saves and loads a job", async () => {
    await saveJob(makePersisted("a"));
    const all = await loadAllJobs();
    expect(all.some((job) => job.id === "a")).toBe(true);
  });

  it("overwrites a job saved twice under the same id", async () => {
    await saveJob(makePersisted("b"));
    const updated = { ...makePersisted("b"), fileName: "renamed.png" };
    await saveJob(updated);

    const all = await loadAllJobs();
    const matches = all.filter((job) => job.id === "b");
    expect(matches).toHaveLength(1);
    expect(matches[0].fileName).toBe("renamed.png");
  });

  it("deletes a job", async () => {
    await saveJob(makePersisted("c"));
    await deleteJob("c");
    const all = await loadAllJobs();
    expect(all.some((job) => job.id === "c")).toBe(false);
  });
});

describe("db (selected-job-id meta)", () => {
  it("round-trips a selected job id", async () => {
    await saveSelectedJobId("job-42");
    expect(await loadSelectedJobId()).toBe("job-42");
  });

  it("round-trips null (deselected)", async () => {
    await saveSelectedJobId("job-42");
    await saveSelectedJobId(null);
    expect(await loadSelectedJobId()).toBeNull();
  });
});

describe("db availability guard", () => {
  it("no-ops instead of throwing when indexedDB is unavailable", async () => {
    const original = globalThis.indexedDB;
    // @ts-expect-error -- deliberately simulating an environment without IndexedDB
    delete globalThis.indexedDB;
    try {
      await expect(saveJob(makePersisted("guarded"))).resolves.toBeUndefined();
      await expect(loadAllJobs()).resolves.toEqual([]);
      await expect(deleteJob("guarded")).resolves.toBeUndefined();
      await expect(saveSelectedJobId("x")).resolves.toBeUndefined();
      await expect(loadSelectedJobId()).resolves.toBeNull();
    } finally {
      globalThis.indexedDB = original;
    }
  });
});
