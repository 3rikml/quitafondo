import JSZip from "jszip";

export interface ZipEntry {
  name: string;
  blob: Blob;
}

function dedupeName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dotIndex = name.lastIndexOf(".");
  const base = dotIndex === -1 ? name : name.slice(0, dotIndex);
  const ext = dotIndex === -1 ? "" : name.slice(dotIndex);
  let counter = 1;
  let candidate = `${base} (${counter})${ext}`;
  while (used.has(candidate)) {
    counter += 1;
    candidate = `${base} (${counter})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

export async function buildZipFromBlobs(entries: ZipEntry[]): Promise<Blob> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const entry of entries) {
    const finalName = dedupeName(entry.name, usedNames);
    zip.file(finalName, entry.blob);
  }

  return zip.generateAsync({ type: "blob" });
}
