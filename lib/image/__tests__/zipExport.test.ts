import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildZipFromBlobs } from "../zipExport";

describe("buildZipFromBlobs", () => {
  it("produces a zip whose entries match the given names and contents", async () => {
    const entries = [
      { name: "a.png", blob: new Blob(["hello"], { type: "text/plain" }) },
      { name: "b.png", blob: new Blob(["world"], { type: "text/plain" }) },
    ];

    const zipBlob = await buildZipFromBlobs(entries);
    const reloaded = await JSZip.loadAsync(await zipBlob.arrayBuffer());

    expect(Object.keys(reloaded.files).sort()).toEqual(["a.png", "b.png"]);
    expect(await reloaded.files["a.png"].async("text")).toBe("hello");
    expect(await reloaded.files["b.png"].async("text")).toBe("world");
  });

  it("de-duplicates file names by appending a numeric suffix", async () => {
    const entries = [
      { name: "photo.png", blob: new Blob(["one"], { type: "text/plain" }) },
      { name: "photo.png", blob: new Blob(["two"], { type: "text/plain" }) },
    ];

    const zipBlob = await buildZipFromBlobs(entries);
    const reloaded = await JSZip.loadAsync(await zipBlob.arrayBuffer());

    expect(Object.keys(reloaded.files).sort()).toEqual(["photo (1).png", "photo.png"]);
  });
});
