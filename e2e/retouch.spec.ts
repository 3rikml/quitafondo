import { expect, test, type Page } from "@playwright/test";
import { makeTestPhoto } from "./helpers";

async function openRetouch(page: Page) {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles(await makeTestPhoto(page));
  await expect(page.getByRole("button", { name: /Descargar PNG/ })).toBeEnabled();
  await page.getByRole("button", { name: "Retoque", exact: true }).click();
  const canvas = page.locator("main section canvas").first();
  const pixel = (x: number, y: number) =>
    canvas.evaluate((c: HTMLCanvasElement, [px, py]) => Array.from(c.getContext("2d")!.getImageData(px, py, 1, 1).data), [x, y]);
  // Brush sweep over a photo-pixel rectangle, measured from the canvas' current box (so it survives zoom).
  const sweep = async (x0: number, x1: number, y0: number, y1: number, step = 8) => {
    const box = (await canvas.boundingBox())!;
    for (let y = y0; y <= y1; y += step) {
      const sy = box.y + (y / 480) * box.height;
      await page.mouse.move(box.x + (x0 / 640) * box.width, sy);
      await page.mouse.down();
      await page.mouse.move(box.x + (x1 / 640) * box.width, sy, { steps: 4 });
      await page.mouse.up();
    }
  };
  return { canvas, pixel, sweep };
}

test("Borrar erases the subject and Restaurar brings it back with its own colour", async ({ page }) => {
  const { pixel, sweep } = await openRetouch(page);
  expect((await pixel(320, 250))[3]).toBe(255);

  await page.getByRole("button", { name: "Borrar", exact: true }).click();
  await sweep(250, 390, 220, 280);
  await expect.poll(async () => (await pixel(320, 250))[3]).toBe(0);

  await page.getByRole("button", { name: "Restaurar", exact: true }).click();
  await sweep(250, 390, 220, 280);
  await expect.poll(async () => (await pixel(320, 250))[3]).toBe(255);
  const [r, g, b] = await pixel(300, 230);
  expect(r + g + b).toBeGreaterThan(150);
});

test("Restaurar recovers the backdrop the model removed, in the photo's blue and not black", async ({ page }) => {
  const { pixel, sweep } = await openRetouch(page);
  expect((await pixel(60, 60))[3]).toBe(0); // backdrop removed

  await page.getByRole("button", { name: "Restaurar", exact: true }).click();
  await sweep(30, 130, 30, 130, 6);
  await expect.poll(async () => (await pixel(80, 80))[3]).toBe(255);
  const [r, g, b] = await pixel(80, 80);
  expect(b).toBeGreaterThan(150); // #4a90d9
  expect(r).toBeLessThan(120);
  expect(g).toBeGreaterThan(100);
});

test("the brushes keep working when the stage is zoomed in", async ({ page }) => {
  const { canvas, pixel, sweep } = await openRetouch(page);
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down("Control");
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -120);
  await page.keyboard.up("Control");

  await page.getByRole("button", { name: "Borrar", exact: true }).click();
  const zoomed = (await canvas.boundingBox())!;
  expect(zoomed.width).toBeGreaterThan(box.width * 1.3);
  // Sweep only the part of the disc that is on screen.
  await sweep(290, 350, 230, 270, 4);
  await expect.poll(async () => (await pixel(320, 250))[3]).toBe(0);
});

test("a soft Borrar brush still erases the middle of a stroke and never reveals the removed backdrop", async ({ page }) => {
  const { pixel, sweep } = await openRetouch(page);
  await page.getByRole("button", { name: "Borrar", exact: true }).click();
  const hardness = page.getByRole("slider", { name: "Dureza del pincel" });
  await hardness.focus();
  await page.keyboard.press("Home"); // 0%: the softest edge

  await sweep(200, 440, 200, 300, 3);
  // A fully soft brush leaves a graduated edge, but its stroke is clearly erased.
  await expect.poll(async () => (await pixel(320, 250))[3], { timeout: 15_000 }).toBeLessThan(80);
  // The backdrop the model removed stays removed around the stroke.
  expect((await pixel(150, 250))[3]).toBe(0);
  expect((await pixel(60, 60))[3]).toBe(0);
});

test("the automatic-edge Restaurar brush brings back the removed backdrop", async ({ page }) => {
  const { pixel, sweep } = await openRetouch(page);
  await page.getByRole("button", { name: "Restaurar", exact: true }).click();
  await page.getByRole("switch", { name: "Detección automática de bordes" }).click();
  await sweep(30, 130, 30, 130, 6);
  await expect.poll(async () => (await pixel(80, 80))[3], { timeout: 20_000 }).toBeGreaterThan(0);
});
