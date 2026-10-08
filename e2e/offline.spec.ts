import { expect, test } from "@playwright/test";
import { makeTestPhoto } from "./helpers";

test("works offline once the app and the model are cached", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker

  // Process once online so the model is cached.
  await page.locator('input[type="file"]').first().setInputFiles(await makeTestPhoto(page, "online.png"));
  await expect(page.getByRole("button", { name: /Descargar PNG/ })).toBeEnabled();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "QuitaFondo" })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles(await makeTestPhoto(page, "offline.png"));
  await expect(page.getByRole("button", { name: "Abrir offline.png" })).toBeVisible();
  await expect(page.locator("header").getByText("offline.png")).toBeVisible();
  await expect(page.getByRole("button", { name: /Descargar PNG/ })).toBeEnabled();
});
