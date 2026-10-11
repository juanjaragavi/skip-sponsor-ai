import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/extension/manifest.json";

export default defineConfig({
  plugins: [crx({ manifest })],
  build: { outDir: "dist/extension" },
  // 5174, not Vite's default 5173 (interactive-cv's dev port), so both can run
  // at once. strictPort fails loudly instead of drifting to another port,
  // which would break the CRXJS HMR client baked into the dev build.
  server: { port: 5174, strictPort: true, hmr: { port: 5174 } },
});
