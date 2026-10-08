import { expect, test } from "@playwright/test";
import { makeTestPhoto } from "./helpers";

// Downloads the ~208 MB LaMa model and runs it on the CPU: give it time.
test.setTimeout(420_000);

test("the magic eraser fills a painted object with its surroundings, and can be undone", async ({ page }) => {
  await page.goto("/");
  // Red disc with a yellow square in the middle, on blue (see helpers.ts).
  await page.locator('input[type="file"]').first().setInputFiles(await makeTestPhoto(page));
  await expect(page.getByRole("button", { name: /Descargar PNG/ })).toBeVisible();

  await page.getByRole("button", { name: "Activar retoque" }).click();
  await page.getByRole("button", { name: "Borrador" }).click();

  const canvas = page.locator("main section canvas").first();
  const pixel = (x: number, y: number) =>
    canvas.evaluate((c: HTMLCanvasElement, [px, py]) => Array.from(c.getContext("2d")!.getImageData(px, py, 1, 1).data), [x, y]);
  const [r0, g0] = await pixel(320, 250);
  expect(r0).toBeGreaterThan(200);
  expect(g0).toBeGreaterThan(200); // yellow

  // Paint over the yellow square (280..360 × 210..290 in photo pixels).
  const box = (await canvas.boundingBox())!;
  for (let y = 205; y <= 295; y += 12) {
    const sy = box.y + (y / 480) * box.height;
    await page.mouse.move(box.x + (275 / 640) * box.width, sy);
    await page.mouse.down();
    await page.mouse.move(box.x + (365 / 640) * box.width, sy, { steps: 6 });
    await page.mouse.up();
  }

  const undo = page.getByRole("button", { name: "Deshacer borrado" });
  await expect(undo).toBeDisabled();
  await page.getByRole("button", { name: "Borrar lo pintado" }).click();
  await expect(undo).toBeEnabled({ timeout: 400_000 });

  // The square is now filled with the disc's red.
  await expect.poll(async () => (await pixel(320, 250))[1], { timeout: 10_000 }).toBeLessThan(80);
  const [r1] = await pixel(320, 250);
  expect(r1).toBeGreaterThan(150);

  await undo.click();
  await expect.poll(async () => (await pixel(320, 250))[1], { timeout: 10_000 }).toBeGreaterThan(200);
});
