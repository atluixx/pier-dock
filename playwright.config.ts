import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/widgets",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 1440, height: 1000 },
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    launchOptions: process.env.PIER_BROWSER_EXECUTABLE ? { executablePath: process.env.PIER_BROWSER_EXECUTABLE } : {},
  },
  webServer: {
    command: "npm run dev -- --host 0.0.0.0",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
});
