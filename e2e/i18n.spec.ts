import { expect, test } from "@playwright/test";

test("switches the interface to English and remembers the choice", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Arrastra tus imágenes aquí")).toBeVisible();

  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByText("Drop your images here")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  await page.reload();
  await expect(page.getByText("Drop your images here")).toBeVisible();

  await page.getByRole("button", { name: "Cambiar a español" }).click();
  await expect(page.getByText("Arrastra tus imágenes aquí")).toBeVisible();
});

test.describe("with an English browser", () => {
  test.use({ locale: "en-US" });

  test("starts in English without a hydration mismatch", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    await expect(page.getByText("Upload an image to get started")).toBeVisible();
    // The server renders Spanish; the switch must happen after hydration, not during it.
    expect(errors).toEqual([]);
  });
});
