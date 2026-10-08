import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { alphaStats, makeTestPhoto } from "./helpers";

test("paste a photo, remove its background and download a transparent PNG", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const photo = await makeTestPhoto(page, "pegada.png");

  // Paste it (Ctrl/Cmd+V path), as a user would with a screenshot.
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], "pegada.png", { type: "image/png" }));
    window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer }));
  }, photo.buffer.toString("base64"));

  const download = page.getByRole("button", { name: /Descargar PNG/ });
  await expect(download).toBeVisible();

  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toBe("pegada.png");
  const stats = await alphaStats(page, fs.readFileSync(await file.path()));
  expect(stats.width).toBe(640);
  expect(stats.height).toBe(480);
  // The backdrop is gone and the subject is kept.
  expect(stats.transparent).toBeGreaterThan(640 * 480 * 0.3);
  expect(stats.opaque).toBeGreaterThan(640 * 480 * 0.1);
});

test("before/after comparison and undo of a brush stroke", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles(await makeTestPhoto(page));
  await expect(page.getByRole("button", { name: /Descargar PNG/ })).toBeVisible();

  await page.getByRole("button", { name: "Comparar" }).click();
  await expect(page.getByLabel("Comparar original y resultado")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Comparar original y resultado")).toHaveCount(0);

  const canvas = page.locator("main section canvas").first();
  const alphaSum = () =>
    canvas.evaluate((c: HTMLCanvasElement) => {
      const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let sum = 0;
      for (let i = 3; i < data.length; i += 4) sum += data[i];
      return sum;
    });

  const before = await alphaSum();
  await page.getByRole("button", { name: "Activar retoque" }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.52);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.52, { steps: 8 });
  await page.mouse.up();
  await expect.poll(alphaSum).toBeLessThan(before);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(alphaSum).toBe(before);
});
