import { expect, test } from "@playwright/test";

// Downloads the SlimSAM model on first use.
test.setTimeout(420_000);

test("'Solo este' keeps the clicked object and removes the other one", async ({ page }) => {
  await page.goto("/");
  const photo = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(640, 480);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#4a90d9";
    ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = "#d0021b";
    ctx.beginPath();
    ctx.arc(170, 240, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f8e71c";
    ctx.beginPath();
    ctx.arc(470, 240, 110, 0, Math.PI * 2);
    ctx.fill();
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  });
  await page.locator('input[type="file"]').first().setInputFiles({ name: "dos.png", mimeType: "image/png", buffer: Buffer.from(photo, "base64") });
  await expect(page.getByRole("button", { name: /Descargar PNG/ })).toBeEnabled();

  const canvas = page.locator("main section canvas").first();
  const alphaAt = (x: number, y: number) =>
    canvas.evaluate((c: HTMLCanvasElement, [px, py]) => c.getContext("2d")!.getImageData(px, py, 1, 1).data[3], [x, y]);
  expect(await alphaAt(170, 240)).toBe(255);
  expect(await alphaAt(470, 240)).toBe(255);

  await page.getByRole("button", { name: "Retoque", exact: true }).click();
  await page.getByRole("button", { name: "Mágica", exact: true }).click();
  await page.getByRole("tab", { name: "Solo este" }).click();
  await expect(page.getByText(/Analizando la imagen/)).toBeHidden({ timeout: 400_000 });

  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + (170 / 640) * box.width, box.y + (240 / 480) * box.height);
  await expect.poll(async () => alphaAt(470, 240), { timeout: 60_000 }).toBe(0);
  expect(await alphaAt(170, 240)).toBe(255);
});
