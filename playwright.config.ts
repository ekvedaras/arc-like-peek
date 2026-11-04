import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "artifacts/test-results",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"], ["html", { outputFolder: "artifacts/report", open: "never" }]],
  use: {
    trace: "retain-on-failure",
  },
});
