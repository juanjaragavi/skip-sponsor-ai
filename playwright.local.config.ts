import { defineConfig } from "@playwright/test";

/**
 * Local-first acceptance (`bash scripts/local.sh smoke`): the real API on the LOCAL stack
 * (Postgres/Redis in Docker, LLM stub) and the extension built against it. Separate from
 * playwright.config.ts, whose suite runs against the fake API; never in CI.
 */
export default defineConfig({
  testDir: "src/tests/local-smoke",
  testMatch: "**/*.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results/local-smoke",
});
