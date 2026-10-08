import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests against the production build (the service worker only
 * registers in production). The first test downloads the AI model (~90 MB)
 * from Hugging Face, hence the generous timeouts.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 120_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:3000",
    // The specs use the Spanish (default) labels; i18n.spec.ts covers English.
    locale: "es-ES",
    trace: "retain-on-failure",
  },
  // PLAYWRIGHT_CHANNEL=chrome runs the locally installed Chrome instead of
  // Playwright's bundled Chromium (`npx playwright install chromium`).
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL || undefined } },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
