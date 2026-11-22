import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/tests/unit/**/*.test.ts", "src/**/*.test.ts"],
    // No chrome.i18n under Vitest: t() falls back to _locales/en/messages.json.
    setupFiles: ["src/tests/setup/i18n.ts"],
    coverage: {
      provider: "v8",
      thresholds: { lines: 80, branches: 80, functions: 80 },
    },
  },
});
