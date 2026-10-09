import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "src/tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./src/tests/e2e/global-setup.ts",
  // One fake API port and one extension build: run serially.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results",
});
