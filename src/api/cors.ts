/** Chrome extension IDs are 32 characters from a–p. */
const ANY_CHROME_EXTENSION = /^chrome-extension:\/\/[a-p]{32}$/;

/**
 * @fastify/cors `origin` from CORS_ORIGIN:
 * - comma-separated exact origins, e.g. `chrome-extension://<item id>`;
 * - `*` reflects any origin;
 * - unset: any origin in development, any chrome-extension:// origin in
 *   production (pin the store item ID once it is known).
 *
 * CORS only limits browsers. The install-token quota and rate limits are what
 * protect the API from scripted clients.
 */
export function corsOrigin(
  raw: string,
  production: boolean,
): boolean | string[] | RegExp {
  const list = raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  if (list.includes("*")) return true;
  if (list.length > 0) return list;
  return production ? ANY_CHROME_EXTENSION : true;
}
