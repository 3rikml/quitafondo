import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { makeTestPhoto } from "./helpers";

/** Mean luminance of the fully opaque pixels of a PNG, decoded in the page. */
async function subjectLuminance(page: Page, png: Buffer): Promise<number> {
  return page.evaluate(async (base64) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const d = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let sum = 0;
    let count = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] !== 255) continue;
      sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      count++;
    }
    return sum / count;
  }, png.toString("base64"));
}

async function download(page: Page): Promise<Buffer> {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Descargar PNG/ }).click()]);
  return fs.readFileSync(await file.path());
}

test("brightness is applied to the subject in the downloaded image", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles(await makeTestPhoto(page));
  await expect(page.getByRole("button", { name: /Descargar PNG/ })).toBeVisible();

  const before = await subjectLuminance(page, await download(page));
  const brightness = page.getByRole("slider", { name: "Brillo" });
  await brightness.focus();
  for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Brillo (+40)")).toBeVisible();
  const after = await subjectLuminance(page, await download(page));
  expect(after).toBeGreaterThan(before + 15);

  await page.getByRole("button", { name: "Restablecer", exact: true }).first().click();
  await expect(page.getByText("Brillo (0)")).toBeVisible();
});
