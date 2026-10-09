import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export const E2E_API_PORT = 39517;
export const E2E_EXTENSION_DIR = resolve("dist/e2e-extension");

/** Build the real MV3 bundle pointed at the fake API used by the E2E suite. */
export default function globalSetup(): void {
  execFileSync(
    "npx",
    ["vite", "build", "--outDir", E2E_EXTENSION_DIR, "--emptyOutDir"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_API_BASE_URL: `http://127.0.0.1:${E2E_API_PORT}`,
      },
    },
  );
}
