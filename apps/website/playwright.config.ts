import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
    launchOptions: {
      args: ["--disable-dev-shm-usage"],
    },
  },
  webServer: {
    command: "pnpm exec vp dev",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    url: "http://127.0.0.1:5173",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
