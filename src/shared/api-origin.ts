/**
 * Resolves the extension's API origin at build time (vite.config.ts injects
 * it as __API_ORIGIN__). There is deliberately no hard-coded production
 * fallback: a production build without VITE_API_BASE_URL fails instead of
 * shipping a placeholder host.
 */
export const DEV_API_ORIGIN = "http://localhost:3040";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function resolveApiOrigin(
  raw: string | undefined,
  { production }: { production: boolean },
): string {
  const value = (raw ?? "").trim();
  if (!value) {
    if (!production) return DEV_API_ORIGIN;
    throw new Error(
      "VITE_API_BASE_URL is required for production builds. Set it in .env.production " +
        "(e.g. VITE_API_BASE_URL=https://api.your-domain.com) or in the environment. " +
        "For a local build use `vite build --mode development`.",
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`VITE_API_BASE_URL is not a valid URL: ${value}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("VITE_API_BASE_URL must be an http(s) URL.");
  if (url.search || url.hash)
    throw new Error("VITE_API_BASE_URL must not contain a query or fragment.");
  // Plain http only for a local API (dev server, E2E harness). The store
  // packager (scripts/zip-extension.mjs) separately refuses loopback hosts.
  if (production && url.protocol === "http:" && !LOOPBACK.has(url.hostname))
    throw new Error(
      `VITE_API_BASE_URL must use https in production builds (got ${url.origin}).`,
    );
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}
