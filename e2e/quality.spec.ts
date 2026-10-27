import { expect, test } from "@playwright/test";
import { makeTestPhoto } from "./helpers";

// Downloads BEN2 (~219 MB) and runs it on the CPU: give it time.
test.setTimeout(420_000);

test("the maximum-quality switch makes the next cutout use the larger model, and is remembered", async ({ page }) => {
  const loaded: string[] = [];
  page.on("console", (m) => {
    const match = /Cargando (\S+) en (\S+)/.exec(m.text());
    if (match) loaded.push(`${match[1]}@${match[2]}`);
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Preferencias" }).click();
  const toggle = page.getByRole("switch", { name: "Recorte de máxima calidad" });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
  await page.keyboard.press("Escape");

  await page.locator('input[type="file"]').first().setInputFiles(await makeTestPhoto(page));
  await expect(page.getByRole("button", { name: /Descargar PNG/ })).toBeEnabled({ timeout: 400_000 });
  // Machines whose GPU fits BiRefNet ignore the switch; everywhere else it is BEN2 on the CPU.
  expect(loaded.some((entry) => entry.startsWith("onnx-community/BEN2-ONNX") || entry.startsWith("onnx-community/BiRefNet_lite-ONNX"))).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Preferencias" }).click();
  await expect(page.getByRole("switch", { name: "Recorte de máxima calidad" })).toBeChecked();
});
