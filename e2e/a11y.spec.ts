import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { makeTestPhoto } from "./helpers";

// Serious and critical WCAG A/AA violations fail the build.
async function violations(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test("the welcome screen has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "QuitaFondo" })).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("the editor has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles(await makeTestPhoto(page, "a11y.png"));
  await expect(page.getByRole("button", { name: /Descargar PNG/ })).toBeEnabled();
  expect(await violations(page)).toEqual([]);
});
