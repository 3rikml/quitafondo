import type { Page } from "@playwright/test";

/**
 * Builds a synthetic test photo in the page (a red disc and a yellow square on
 * a blue backdrop) so the tests depend on no third-party images.
 */
export async function makeTestPhoto(page: Page, name = "foto.png"): Promise<{ name: string; mimeType: string; buffer: Buffer }> {
  const base64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(640, 480);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#4a90d9";
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = "#d0021b";
    ctx.beginPath();
    ctx.arc(320, 250, 140, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f8e71c";
    ctx.fillRect(280, 210, 80, 80);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  return { name, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

/** Alpha values of a PNG, decoded in the page: how many fully transparent and fully opaque pixels it has. */
export async function alphaStats(page: Page, png: Buffer): Promise<{ width: number; height: number; transparent: number; opaque: number }> {
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let transparent = 0;
    let opaque = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] === 0) transparent++;
      else if (data[i] === 255) opaque++;
    }
    return { width: bitmap.width, height: bitmap.height, transparent, opaque };
  }, png.toString("base64"));
}
