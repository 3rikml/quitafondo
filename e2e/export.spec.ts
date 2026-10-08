import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { alphaStats, makeTestPhoto } from "./helpers";

test("background preset and shadow are baked into the ZIP export", async ({ page }) => {
  await page.goto("/");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles([await makeTestPhoto(page, "uno.png"), await makeTestPhoto(page, "dos.png")]);
  await expect(page.getByText("Listo")).toHaveCount(2);

  await page.getByText("uno.png").click();
  await page.getByRole("button", { name: "Negro" }).click();
  await page.getByRole("tab", { name: "Contacto" }).click();

  const [zip] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /Descargar todo/ }).click()]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "quitafondo-zip-"));
  const zipPath = path.join(dir, "export.zip");
  await zip.saveAs(zipPath);
  execFileSync("unzip", ["-q", zipPath, "-d", dir]);

  // "uno" got an opaque black background; "dos" kept its transparency.
  const uno = await alphaStats(page, fs.readFileSync(path.join(dir, "uno.png")));
  const dos = await alphaStats(page, fs.readFileSync(path.join(dir, "dos.png")));
  expect(uno.transparent).toBe(0);
  expect(dos.transparent).toBeGreaterThan(0);
});
