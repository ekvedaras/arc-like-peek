import { defineConfig } from "@playwright/test";

/**
 * Opt-in run against live websites (`bun run test:real-sites`). Kept out of `bun run check` because it
 * depends on the network and on sites we do not control.
 */
export default defineConfig({
  testDir: "e2e/real-sites",
  testMatch: "**/*.spec.ts",
  outputDir: "artifacts/real-sites",
  fullyParallel: true,
  workers: 3,
  forbidOnly: true,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "artifacts/real-sites-report", open: "never" }]],
  use: {
    trace: "retain-on-failure",
  },
});
