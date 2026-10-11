import { defineConfig, loadEnv } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/extension/manifest.json";
import { resolveApiOrigin } from "./src/shared/api-origin";

export default defineConfig(({ command, mode }) => {
  // VITE_API_BASE_URL from the environment or .env[.mode][.local] files.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiOrigin = resolveApiOrigin(env["VITE_API_BASE_URL"], {
    production: command === "build" && mode !== "development",
  });
  return {
    plugins: [crx({ manifest })],
    define: { __API_ORIGIN__: JSON.stringify(apiOrigin) },
    build: { outDir: "dist/extension" },
    // 5174, not Vite's default 5173 (interactive-cv's dev port), so both can run
    // at once. strictPort fails loudly instead of drifting to another port,
    // which would break the CRXJS HMR client baked into the dev build.
    server: { port: 5174, strictPort: true, hmr: { port: 5174 } },
  };
});
